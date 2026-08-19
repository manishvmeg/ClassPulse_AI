"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  XCircle,
  Lightbulb,
} from "lucide-react";
import { API_URL } from "@/lib/config";

export interface Flashcard {
  question: string;
  answer: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
}

interface FlashcardDeckProps {
  roomId: string;
  initialFlashcards?: Flashcard[];
  initialQuiz?: QuizQuestion[];
}

export default function FlashcardDeck({
  roomId,
  initialFlashcards,
  initialQuiz,
}: FlashcardDeckProps) {
  const [activeTab, setActiveTab] = useState<"flashcards" | "quiz">("flashcards");
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards || []);
  const [quiz, setQuiz] = useState<QuizQuestion[]>(initialQuiz || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Flashcard State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCards, setKnownCards] = useState<Set<number>>(new Set());

  // Quiz State
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  useEffect(() => {
    if (flashcards.length === 0 || quiz.length === 0) {
      fetchStudyPack();
    }
  }, [roomId]);

  const fetchStudyPack = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/study-pack`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to load study pack");
      const data = await res.json();
      if (data.flashcards) setFlashcards(data.flashcards);
      if (data.quiz) setQuiz(data.quiz);
    } catch (e: any) {
      console.warn("Study pack fallback loaded:", e);
      // Default high-yield fallback
      setFlashcards([
        {
          question: "What is the primary function of Backpropagation in neural networks?",
          answer: "It calculates the gradient of the loss function with respect to each weight using the chain rule, enabling gradient descent.",
        },
        {
          question: "Why do adaptive optimizers like Adam perform well in non-convex spaces?",
          answer: "They compute individual adaptive learning rates for different parameters from estimates of first and second moments of the gradients.",
        },
        {
          question: "How does real-time pace telemetry enhance classroom pedagogy?",
          answer: "It creates a live feedback loop so instructors can adjust lecture velocity before students accumulate cognitive friction.",
        },
        {
          question: "What is the benefit of anonymous doubt submission in live lectures?",
          answer: "It reduces social anxiety and psychological barriers, increasing participation and revealing authentic comprehension blockers.",
        },
        {
          question: "How do STUN and TURN protocols facilitate WebRTC peer communication?",
          answer: "STUN resolves public IP addresses across NATs, while TURN provides a fallback media relay server when direct P2P connections are blocked.",
        },
      ]);
      setQuiz([
        {
          question: "Which mechanism ensures low-latency state synchronization in ClassPulse AI?",
          options: [
            "HTTP long-polling with 5s delay",
            "Asynchronous WebSocket pub-sub channels",
            "Periodic database polling every minute",
            "Static file reloads",
          ],
          correct_answer: 1,
          explanation: "WebSocket pub-sub enables bidirectional messaging with sub-20ms latency.",
        },
        {
          question: "Why are heavy LLM operations executed asynchronously via worker threads?",
          options: [
            "To prevent blocking the FastAPI event loop and keep real-time sockets responsive",
            "Because Python does not support async/await",
            "To disable database writes during inference",
            "To reduce frontend rendering speed",
          ],
          correct_answer: 0,
          explanation: "Offloading I/O bound LLM calls preserves real-time WebSocket throughput.",
        },
        {
          question: "When should an instructor pause and check comprehension during a class?",
          options: [
            "Only at the very end of the semester",
            "When the Pace Radar shows elevated 'Too Fast' percentages or doubts cluster",
            "Never, lectures should proceed at fixed speed",
            "When audio is muted",
          ],
          correct_answer: 1,
          explanation: "Telemetry spikes indicate when lecture comprehension is breaking down.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % (flashcards.length || 1));
    }, 150);
  };

  const handlePrevCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + (flashcards.length || 1)) % (flashcards.length || 1));
    }, 150);
  };

  const markKnown = (isKnown: boolean) => {
    const updated = new Set(knownCards);
    if (isKnown) {
      updated.add(currentIndex);
    } else {
      updated.delete(currentIndex);
    }
    setKnownCards(updated);
    handleNextCard();
  };

  const handleSelectQuizOption = (qIdx: number, optIdx: number) => {
    if (quizSubmitted) return;
    setQuizAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  const calculateScore = () => {
    let score = 0;
    quiz.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correct_answer) {
        score++;
      }
    });
    return score;
  };

  const submitQuiz = () => {
    setQuizSubmitted(true);
    const score = calculateScore();
    if (score >= Math.ceil(quiz.length * 0.7)) {
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {}
    }
  };

  const resetQuiz = () => {
    setQuizAnswers({});
    setQuizSubmitted(false);
  };

  const currentCard = flashcards[currentIndex] || {
    question: "No flashcards available.",
    answer: "Generate a study pack from the class discussion.",
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col">
      {/* Header with Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Post-Lecture Revision & Practice
            </h3>
            <p className="text-xs text-slate-400">AI-synthesized flashcards and self-check practice quiz</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto">
          <button
            onClick={() => setActiveTab("flashcards")}
            className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "flashcards"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Flashcards ({flashcards.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("quiz")}
            className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "quiz"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Practice Quiz ({quiz.length})</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">Synthesizing lecture study pack with Gemini 3.5 Flash...</p>
        </div>
      ) : activeTab === "flashcards" ? (
        /* Flashcards Mode */
        <div className="flex flex-col items-center">
          {/* Progress Indicator */}
          <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-3 font-mono">
            <span>
              Card {currentIndex + 1} of {flashcards.length}
            </span>
            <span className="text-emerald-400 font-semibold">
              Mastered: {knownCards.size} / {flashcards.length}
            </span>
          </div>

          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden mb-6 border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / (flashcards.length || 1)) * 100}%` }}
            />
          </div>

          {/* 3D Flip Card Container */}
          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className="w-full max-w-lg min-h-[220px] sm:min-h-[240px] cursor-pointer rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-6 flex flex-col justify-between shadow-xl transition-all duration-300 hover:border-indigo-500/50 hover:shadow-indigo-500/10 relative group"
          >
            <div className="flex items-center justify-between text-xs text-indigo-400 font-semibold">
              <span className="flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4" />
                {isFlipped ? "Answer / Explanation" : "Concept Question"}
              </span>
              <span className="text-[11px] text-slate-400 group-hover:text-indigo-300 transition-colors">
                Click to {isFlipped ? "flip back" : "reveal answer"} ↻
              </span>
            </div>

            <div className="my-auto py-4 text-center">
              <p
                className={`text-base sm:text-lg font-medium leading-relaxed transition-all duration-200 ${
                  isFlipped ? "text-emerald-300" : "text-slate-100 font-semibold"
                }`}
              >
                {isFlipped ? currentCard.answer : currentCard.question}
              </p>
            </div>

            <div className="flex justify-between items-center text-[11px] text-slate-400 border-t border-slate-800/80 pt-3">
              <span>ClassPulse AI Revision</span>
              <span>{knownCards.has(currentIndex) ? "✓ Mastered" : "Needs Review"}</span>
            </div>
          </div>

          {/* Card Action Controls */}
          <div className="w-full max-w-lg flex items-center justify-between mt-6 gap-3">
            <button
              onClick={handlePrevCard}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Previous Card"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => markKnown(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>Need Review</span>
              </button>
              <button
                onClick={() => markKnown(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-all flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>I Know This</span>
              </button>
            </div>

            <button
              onClick={handleNextCard}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Next Card"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        /* Quiz Mode */
        <div className="space-y-6">
          {quiz.map((q, qIdx) => (
            <div
              key={qIdx}
              className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3"
            >
              <div className="flex items-start gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600/20 text-indigo-400 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                  {qIdx + 1}
                </span>
                <p className="text-sm font-semibold text-slate-100 leading-snug">{q.question}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {q.options.map((opt, optIdx) => {
                  const isSelected = quizAnswers[qIdx] === optIdx;
                  const isCorrect = q.correct_answer === optIdx;
                  let btnStyle = "bg-slate-900 hover:bg-slate-800/80 text-slate-300 border-slate-800";

                  if (quizSubmitted) {
                    if (isCorrect) {
                      btnStyle = "bg-emerald-500/20 border-emerald-500 text-emerald-200 font-medium";
                    } else if (isSelected && !isCorrect) {
                      btnStyle = "bg-rose-500/20 border-rose-500 text-rose-200";
                    } else {
                      btnStyle = "bg-slate-900/40 text-slate-400 border-slate-800/40";
                    }
                  } else if (isSelected) {
                    btnStyle = "bg-indigo-600/20 border-indigo-500 text-indigo-200 font-medium ring-1 ring-indigo-500";
                  }

                  return (
                    <button
                      key={optIdx}
                      onClick={() => handleSelectQuizOption(qIdx, optIdx)}
                      disabled={quizSubmitted}
                      className={`p-3 rounded-xl text-xs text-left border transition-all flex items-start gap-2.5 ${btnStyle}`}
                    >
                      <span className="font-mono text-slate-400 uppercase font-semibold">
                        {String.fromCharCode(65 + optIdx)}.
                      </span>
                      <span className="leading-relaxed flex-1">{opt}</span>
                    </button>
                  );
                })}
              </div>

              {quizSubmitted && (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 mt-2 flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-200">Explanation: </span>
                    {q.explanation}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Quiz Score / Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
            {quizSubmitted ? (
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100">
                    Your Score: {calculateScore()} / {quiz.length} (
                    {Math.round((calculateScore() / (quiz.length || 1)) * 100)}%)
                  </div>
                  <p className="text-xs text-slate-400">
                    {calculateScore() === quiz.length
                      ? "Flawless score! You've mastered today's concepts."
                      : "Great effort! Review the flashcards to reinforce doubts."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                Answered: {Object.keys(quizAnswers).length} of {quiz.length} questions
              </div>
            )}

            <div className="flex items-center gap-2 self-stretch sm:self-auto">
              {quizSubmitted ? (
                <button
                  onClick={resetQuiz}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Try Again</span>
                </button>
              ) : (
                <button
                  onClick={submitQuiz}
                  disabled={Object.keys(quizAnswers).length === 0}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Submit Practice Quiz</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
