from conversations.models import Chat, Message
from documents.agent.agent import create_agent
from documents.services.retriever import retrieve_chunks


def generate_chat_response(
        chat: Chat,
        user_message: str,
) -> dict:

    document = chat.document

    previous_messages = (
        Message.objects
        .filter(chat=chat)
        .order_by("created_at")
    )

    history_parts = []

    for message in previous_messages:
        if message.role == Message.Role.USER:
            role = "Student"
        else:
            role = "CampusLens"

        history_parts.append(
            f"{role}: {message.content}"
        )

    history = "\n".join(history_parts)

    # Use only the current question for document retrieval.
    # Conversation history is still passed to the LLM below
    # so that follow-up questions can be understood.
    retrieval_query = user_message

    retrieved_chunks = retrieve_chunks(
        document=document,
        query=retrieval_query,
        top_k=5,
    )

    if not retrieved_chunks:
        return {
            "answer": (
                "I couldn't find this information "
                "in the uploaded document."
            ),
            "sources": [],
        }

    context_parts = []

    for index, chunk in enumerate(
            retrieved_chunks,
            start=1,
    ):
        context_parts.append(
            f"""
CONTEXT {index}
PAGE: {chunk["page_number"]}

TEXT:
{chunk["text"]}
"""
        )

    document_context = "\n".join(context_parts)

    source_pages = sorted(
        {
            chunk["page_number"]
            for chunk in retrieved_chunks
        }
    )

    actions = list(
        document.actions.all().values(
            "action",
            "page_number",
        )
    )

    deadlines = list(
        document.deadlines.all().values(
            "date",
            "description",
            "page_number",
        )
    )

    important_dates = list(
        document.important_dates.all().values(
            "date",
            "description",
            "page_number",
        )
    )

    agent = create_agent()

    prompt = f"""
You are CampusLens, an AI document assistant for students.

Your job is to answer the student's question using only
information supported by the retrieved document context
and structured document insights below.

DOCUMENT:
{document.title}

RETRIEVED DOCUMENT CONTEXT:
{document_context}

STRUCTURED DOCUMENT INSIGHTS:

Required actions:
{actions}

Deadlines:
{deadlines}

Important dates:
{important_dates}

CONVERSATION HISTORY:
{history if history else "No previous conversation."}

CURRENT STUDENT QUESTION:
{user_message}

RULES:

1. Answer using the retrieved document context and
   structured document insights.

2. Do not invent information that is not supported
   by the retrieved context or structured insights.

3. If the retrieved context and structured insights do not
   contain enough information to answer the question, say:

"I couldn't find this information in the uploaded document."

4. Keep the answer simple and useful for a student.

5. When information comes from the document, include
   the relevant page number using exactly:

[Source: Page X]

6. If information comes from multiple pages, include
   each relevant page.

7. Do not mention internal tools, models, RAG, or
   implementation details unless the student explicitly asks.

8. If the student asks what they need to do, use the
   "Required actions" list as the authoritative list of
   actions the student must perform.

9. Do not create, infer, or add an action that is not present
   in the "Required actions" list.

10. Do not turn an availability date, announcement date,
    exam date, or other informational date into an action
    unless the document explicitly requires the student
    to perform that action.

11. You may mention important dates separately, but describe
    only what the document explicitly states about those dates.
    Do not infer an action, requirement, or consequence from them.

12. Match deadlines to their corresponding required actions
    when the relationship is clear.

13. Do not claim something is present in the document
    unless the retrieved context or structured insights
    support it.

14. If a required action has a corresponding deadline,
    include the deadline with that action.

15. Never infer a student action from an informational statement.
    For example, if the document says an admit card is available,
    do not say the student must collect it unless the document
    explicitly requires collection.

16. Understand follow-up questions using the conversation history.
    If the student uses words such as "which one", "that", "it",
    "when", "where", or "the first one", resolve the reference
    using the previous conversation before answering.
    
17. TABLE AND TIMETABLE INTERPRETATION:

When a timetable contains weekday headers in this order:

MONDAY | TUESDAY | WEDNESDAY | THURSDAY | FRIDAY | SATURDAY

and PDF extraction has flattened the table into plain text, reconstruct
the row using that exact column order.

For each time slot:
- the first schedule entry belongs to MONDAY
- the second belongs to TUESDAY
- the third belongs to WEDNESDAY
- the fourth belongs to THURSDAY
- the fifth belongs to FRIDAY
- the sixth belongs to SATURDAY

Do not reject a timetable question merely because the PDF text
does not preserve visual column boundaries.

If the student asks about MONDAY, inspect the first schedule
entry for each time slot.

If a schedule entry contains a subject, teacher, and room,
extract those values from that entry.

For example, if an entry is:

3AIML4: JP: (SW): NB-514

interpret:
Subject: JP
Teacher: SW
Room: NB-514

Only report information that is actually present in the extracted
document text.

Answer the student's current question.
"""

    response = agent(prompt)

    answer = str(response).strip()

    return {
        "answer": answer,
        "sources": [
            {
                "page_number": page_number,
            }
            for page_number in source_pages
        ],
    }