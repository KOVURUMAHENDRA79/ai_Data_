from typing import Dict

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .models import ChatRequest, ChatResponse, ProcessedAnalysis
from .services.chat_service import ChatServiceError, ask_dataset_question
from .services.dataset_service import AnalysisResult, load_dataframe_from_bytes, parse_selected_tasks, process_dataset

app = FastAPI(title="AI Dataset Analyzer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

analysis_store: Dict[str, Dict] = {}


def _to_response_payload(result: AnalysisResult) -> Dict:
    payload = {
        "analysis_id": result.analysis_id,
        "dataset_preview": result.dataset_preview,
        "row_count": result.row_count,
        "column_count": result.column_count,
    }
    payload.update(result.results)
    return payload


def _error_response(message: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": message})


@app.get("/health")
def health_check() -> Dict[str, str]:
    return {
        "status": "ok",
        "chatbot_mode": "offline",
    }


@app.post("/process-dataset", response_model=ProcessedAnalysis)
async def process_dataset_endpoint(
    file: UploadFile = File(...),
    selected_tasks: str = Form(...),
):
    try:
        if not file or not file.filename:
            return _error_response("Dataset file is required", 400)
        if not file.filename.lower().endswith(".csv"):
            return _error_response("Only CSV files are supported", 400)

        normalized_tasks = parse_selected_tasks(selected_tasks)
        file_bytes = await file.read()
        df = load_dataframe_from_bytes(file_bytes)
        result = process_dataset(df, normalized_tasks)

        payload = _to_response_payload(result)
        analysis_store[result.analysis_id] = payload
        return payload
    except Exception as exc:
        return _error_response(str(exc), 400)
    finally:
        await file.close()


@app.post("/chat", response_model=ChatResponse)
async def chat_with_results(request: ChatRequest):
    try:
        if not request.analysis_id:
            return _error_response("analysis_id is required", 400)

        processed_results = analysis_store.get(request.analysis_id)
        if not processed_results:
            return _error_response("Invalid analysis_id", 404)

        response_payload = ask_dataset_question(processed_results, request.question)
        return ChatResponse(**response_payload)
    except ChatServiceError as exc:
        return _error_response(str(exc), 400)
    except Exception as exc:
        return _error_response(str(exc), 500)