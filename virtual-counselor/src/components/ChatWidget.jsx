import React, { useState } from 'react';
import { MessageCircle, X, Trash2 } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { getLLMAdvice } from '../utils/api';
import { getCompletedCourses, calculateCreditsAchieved } from '../utils/degreeCalculations';
import ReactMarkdown from 'react-markdown';

export default function ChatWidget() {
    const { isOpen, hasUnread, toggleChat, messages, addMessage, clearHistory } = useChatStore();
    const [input, setInput] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Client-side regex check
    const isAllowedTopic = (text) => {
        const pattern = /wsu|course|class|degree|credit|major|schedule|ucore|advising|prerequisite|take|register|enroll|graduate|semester|gpa|grade|meet|seat|open|section|offered|available|instructor|waitlist|when\s+is|what\s+time|[a-z]{2,6}(\s+[a-z]{1,2})?\s*\d{3}/i;
        return pattern.test(text);
    };

    const handleSend = async (e) => {
        e.preventDefault();

        if (!input.trim()) return;
        // Strip HTML tags
        const cleanInput = input.replace(/<[^>]*>?/gm, '').trim();
        // Block prompt injection
        if (/(ignore previous|system prompt|jailbreak|bypass)/i.test(cleanInput)) {
            setError("Invalid request format.");
            return;
        }

        if (!isAllowedTopic(input)) {
            setError("Please keep questions focused on WSU academic advising.");
            return;
        }

        setError(null);
        setIsLoading(true);
        const userMsg = input;
        setInput('');

        // Add user message to UI immediately
        addMessage({ role: 'user', content: userMsg });

        try {
            // Pull actual profile from localStorage (or fallback to defaults if not set yet)
            const storedProfileInfo = localStorage.getItem('studentProfile');
            const parsedProfile = storedProfileInfo ? JSON.parse(storedProfileInfo) : {};

            const rawPlan = localStorage.getItem('wsu_vc_degree_plan');
            const degreePlan = rawPlan ? JSON.parse(rawPlan)?.plan ?? JSON.parse(rawPlan) : null;
            const completedFromPlan = degreePlan ? getCompletedCourses(degreePlan) : [];
            const creditsAchieved = degreePlan ? calculateCreditsAchieved(degreePlan) : 0;

            const studentContext = {
                major: parsedProfile.major || "Undeclared",
                completed_courses: completedFromPlan.length > 0
                    ? completedFromPlan
                    : (parsedProfile.completed_courses || []),
                credits_completed: creditsAchieved,
            };

            const response = await getLLMAdvice(userMsg, studentContext);
            addMessage({ role: 'assistant', content: response.answer, sources: response.sources });
        } catch (err) {
            addMessage({ role: 'assistant', content: `Error: ${err.message}` });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 font-sans">
            {isOpen && (
                <div className="bg-white border rounded-lg shadow-xl w-80 h-96 mb-4 flex flex-col overflow-hidden">
                    <div className="bg-blue-800 text-white p-3 font-bold flex justify-between items-center">
                        <span>WSU Virtual Counselor</span>
                     
                        {messages.length > 0 && (
                            <button
                                onClick={clearHistory}
                                className="text-blue-200 hover:text-white transition-colors p-1"
                                title="Clear Chat History"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>

                    <div className="flex-1 p-3 overflow-y-auto bg-gray-50 text-sm flex flex-col gap-3">
                        {messages.length === 0 && (
                            <p className="text-gray-500 text-center italic mt-4">Ask me about your Computer Science degree progress or WSU courses!</p>
                        )}
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                                <div className={`inline-block p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-black w-full text-sm'}`}>

                                    {msg.role === 'assistant' ? (
                                        <ReactMarkdown
                                            components={{
                                                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                                                ul: ({ children }) => <ul className="list-disc ml-5 mb-2 space-y-1">{children}</ul>,
                                                ol: ({ children }) => <ol className="list-decimal ml-5 mb-2 space-y-1">{children}</ol>,
                                                li: ({ children }) => <li className="">{children}</li>,
                                                strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    ) : (
                                        msg.content
                                    )}
                                </div>

                                {msg.sources && msg.sources.length > 0 && (
                                    <span className="text-[10px] text-gray-400 mt-1">Sources: {msg.sources.join(', ')}</span>
                                )}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="text-left"><span className="inline-block p-2 rounded-lg bg-gray-200 text-black animate-pulse">Thinking...</span></div>
                        )}
                    </div>

                    <form onSubmit={handleSend} className="p-2 border-t bg-white">
                        {error && <p className="text-xs text-red-500 mb-1">{error}</p>}
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Type your question..."
                            className="w-full p-2 border rounded text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            maxLength={500}
                            disabled={isLoading}
                        />
                    </form>
                </div>
            )}

            <button
                onClick={toggleChat}
                className="bg-blue-800 text-white p-4 rounded-full shadow-lg relative float-right hover:bg-blue-700 transition-colors"
            >
                {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
                {hasUnread && !isOpen && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
                )}
            </button>
        </div>
    );
}