import os

from strands import Agent
from strands.models import BedrockModel
from strands.models.ollama import OllamaModel

from documents.agent.tools import search_document

SYSTEM_PROMPT = """
You are CampusLens, an AI document understanding assistant for students.

Your job is to answer questions using the student's uploaded document.

Rules:

1. Use the search_document tool whenever the answer depends on information inside the document.

2. Do not invent information that is not supported by the document.

3. If the document does not contain enough information to answer, clearly say:
   "I couldn't find this information in the uploaded document."

4. When using information from search_document, ALWAYS include
   the source page number in the final answer.

5. Format citations exactly like:
   [Source: Page 2]

6. If information comes from multiple pages, cite each relevant page:
   [Source: Page 1]
   [Source: Page 2]

7. Keep explanations simple and useful for students.

8. Distinguish clearly between information found in the document
   and general explanations.

9. Never claim that something is in the document unless the
   retrieved content actually supports it.

10. Do not mention internal tool names, model names, or implementation
    details unless the student explicitly asks about them.

"""


def create_model():
    """Select a model provider without changing the agent's behavior."""

    provider = os.getenv("AI_MODEL_PROVIDER", "ollama").strip().lower()

    if provider == "bedrock":
        return BedrockModel(
            # Nova on-demand calls in ap-south-1 require this cross-region
            # inference profile rather than the base foundation-model ID.
            model_id=os.getenv(
                "BEDROCK_MODEL_ID",
                "apac.amazon.nova-lite-v1:0",
            ),
            region_name=os.getenv("BEDROCK_REGION", "ap-south-1"),
            temperature=0.1,
        )

    if provider != "ollama":
        raise ValueError(
            "AI_MODEL_PROVIDER must be either 'ollama' or 'bedrock'."
        )

    think = os.getenv("OLLAMA_THINK", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }

    return OllamaModel(
        host=os.getenv("OLLAMA_HOST", "http://localhost:11434"),
        model_id=os.getenv("OLLAMA_MODEL_ID", "qwen3:4b"),
        additional_args={"think": think},
    )


def create_agent() -> Agent:
    """Create the CampusLens Strands agent for local or AWS inference."""

    model = create_model()

    return Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=[search_document],
    )
