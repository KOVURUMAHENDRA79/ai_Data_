import { useState, type FC, type FormEvent } from "react";
import type { ChatResponse } from "../types";

type ChatPanelProps = {
  analysisId: string | null;
};

const ChatPanel: FC<ChatPanelProps> = ({ analysisId }) => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!question.trim()) {
      setError("Enter a question to continue.");
      return;
    }

    if (!analysisId) {
      setError("Process a dataset before using the chatbot.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setAnswer(null);
    setDetails([]);

    try {
      const response = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: question.trim(), analysis_id: analysisId }),
      });

      const payload = (await response.json()) as ChatResponse;

      if (!response.ok || payload.error) {
        throw new Error(payload.error || "Unable to generate response, please try again");
      }

      setAnswer(payload.answer || "Unable to generate response, please try again");
      setDetails(payload.details || []);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to generate response, please try again";
      setError(message || "Unable to generate response, please try again");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-white/65 bg-white/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight text-slate-900">Chatbot</h3>
          <p className="mt-1 text-sm text-slate-500">Ask questions about the processed dataset results.</p>
        </div>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
          Offline
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="min-h-32 w-full rounded-[1.5rem] border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          placeholder="Why was a row marked as anomaly? Explain the predictions."
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">Process a dataset first, then ask result-based questions.</p>
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isLoading ? "Thinking..." : "Ask Chatbot"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {answer ? (
        <div className="mt-5 space-y-4 rounded-[1.5rem] bg-slate-50/90 p-5">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Answer</h4>
            <p className="mt-2 text-sm leading-7 text-slate-700">{answer}</p>
          </div>
          {details.length > 0 ? (
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Details</h4>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {details.map((item) => (
                  <li key={item} className="rounded-xl bg-white px-3 py-2 shadow-sm">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default ChatPanel;
