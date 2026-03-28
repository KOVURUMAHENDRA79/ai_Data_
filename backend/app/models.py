from typing import Any, Dict, List

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    analysis_id: str = Field(..., min_length=1, description="Identifier returned by /process-dataset")


class ChatResponse(BaseModel):
    answer: str
    details: List[str] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: str


class ProcessedAnalysis(BaseModel):
    analysis_id: str
    dataset_preview: List[Dict[str, Any]]
    row_count: int
    column_count: int
    anomalies: Dict[str, Any] | None = None
    missing_values: Dict[str, Any] | None = None
    insights: Dict[str, Any] | None = None
    predictions: Dict[str, Any] | None = None