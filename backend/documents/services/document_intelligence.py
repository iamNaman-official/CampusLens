import json
import re

from documents.agent.agent import create_agent
from documents.models import Document
from documents.services.retriever import retrieve_chunks

DOCUMENT_INTELLIGENCE_QUERY = """
Analyze the uploaded student document and extract:

1. Deadlines
2. Important dates
3. Required actions for students

Return ONLY valid JSON in this exact structure:

{
    "deadlines": [
        {
            "date": "string",
            "description": "string",
            "page": number
        }
    ],
    "important_dates": [
        {
            "date": "string",
            "description": "string",
            "page": number
        }
    ],
    "actions": [
        {
            "action": "string",
            "page": number
        }
    ]
}

Rules:
- Only extract information supported by the document.
- Do not invent dates, actions, or page numbers.
- Page numbers must correspond to the provided document content.
- A deadline should represent a date by which a required action must be completed.
- Important dates are relevant dates that are not necessarily deadlines.
- Actions should represent things the student is explicitly required or instructed to do.
- If nothing is found for a category, return an empty list.
- Return JSON only.
"""


def _extract_json(raw_response: str) -> dict:
    """
    Extract and validate JSON returned by the LLM.
    """

    if not raw_response:
        raise ValueError(
            "LLM returned an empty response for document intelligence."
        )

    raw_response = raw_response.strip()

    # Remove markdown code fences if the model included them.
    raw_response = re.sub(
        r"^```(?:json)?\s*",
        "",
        raw_response,
        flags=re.IGNORECASE,
    )
    raw_response = re.sub(
        r"\s*```$",
        "",
        raw_response,
    )

    try:
        result = json.loads(raw_response)
    except json.JSONDecodeError as exc:
        raise ValueError(
            "LLM returned invalid JSON for document intelligence."
        ) from exc

    if not isinstance(result, dict):
        raise TypeError(
            "Document intelligence response must be a JSON object."
        )

    deadlines = result.get("deadlines", [])
    important_dates = result.get("important_dates", [])
    actions = result.get("actions", [])

    if not isinstance(deadlines, list):
        raise TypeError("deadlines must be a list.")

    if not isinstance(important_dates, list):
        raise TypeError("important_dates must be a list.")

    if not isinstance(actions, list):
        raise TypeError("actions must be a list.")

    return {
        "deadlines": deadlines,
        "important_dates": important_dates,
        "actions": actions,
    }


def validate_document_intelligence(
        result: dict,
        document: Document,
) -> dict:
    """
    Validate the structure and page references returned by the LLM.
    """

    deadlines = result.get("deadlines", [])
    important_dates = result.get("important_dates", [])
    actions = result.get("actions", [])

    valid_pages = set(
        document.pages.values_list(
            "page_number",
            flat=True,
        )
    )

    for deadline in deadlines:
        if not isinstance(deadline, dict):
            raise TypeError(
                "Each deadline must be an object."
            )

        if deadline.get("page") not in valid_pages:
            raise ValueError(
                f"Invalid deadline page: {deadline.get('page')}"
            )

        if not deadline.get("date"):
            raise ValueError(
                "Deadline is missing a date."
            )

        if not deadline.get("description"):
            raise ValueError(
                "Deadline is missing a description."
            )

    for important_date in important_dates:
        if not isinstance(important_date, dict):
            raise TypeError(
                "Each important date must be an object."
            )

        if important_date.get("page") not in valid_pages:
            raise ValueError(
                "Invalid important date page: "
                f"{important_date.get('page')}"
            )

        if not important_date.get("date"):
            raise ValueError(
                "Important date is missing a date."
            )

        if not important_date.get("description"):
            raise ValueError(
                "Important date is missing a description."
            )

    for action in actions:
        if not isinstance(action, dict):
            raise TypeError(
                "Each action must be an object."
            )

        if action.get("page") not in valid_pages:
            raise ValueError(
                f"Invalid action page: {action.get('page')}"
            )

        if not action.get("action"):
            raise ValueError(
                "Action is missing its description."
            )

    return result


def generate_document_intelligence(
        document: Document,
) -> dict:
    """
    Generate structured intelligence from a document using the
    CampusLens agent and retrieved document chunks.
    """

    chunks = retrieve_chunks(
        document=document,
        query=DOCUMENT_INTELLIGENCE_QUERY,
        top_k=10,
        min_score=0.0,
    )

    if not chunks:
        raise ValueError(
            "No document content was available for intelligence extraction."
        )

    context_parts = []

    for chunk in chunks:
        context_parts.append(
            f"[Page {chunk['page_number']}]\n"
            f"{chunk['text']}"
        )

    context = "\n\n".join(context_parts)

    prompt = f"""
{DOCUMENT_INTELLIGENCE_QUERY}

DOCUMENT CONTENT:

{context}
"""

    agent = create_agent()
    response = agent(prompt)

    raw_response = str(response)

    result = _extract_json(raw_response)

    return validate_document_intelligence(
        result=result,
        document=document,
    )