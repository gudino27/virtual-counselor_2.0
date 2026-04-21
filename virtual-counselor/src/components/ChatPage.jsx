import React, { useState, useRef, useEffect } from 'react';
import { Send, User, GraduationCap } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { getLLMAdvice } from '../utils/api';
import { getCompletedCourses, calculateCreditsAchieved } from '../utils/degreeCalculations';

export default function ChatPage() {
    const { messages, addMessage } = useChatStore();
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [statusMsg, setStatusMsg] = useState('');
    const messagesEndRef = useRef(null);

    const STATUS_STEPS = [
        'Validating your question...',
        'Searching course records...',
        'Reviewing degree requirements...',
        'Generating your response...',
    ];

    useEffect(() => {
        if (!isLoading) { setStatusMsg(''); return; }
        setStatusMsg(STATUS_STEPS[0]);
        const timers = STATUS_STEPS.slice(1).map((msg, i) =>
            setTimeout(() => setStatusMsg(msg), (i + 1) * 5000)
        );
        return () => timers.forEach(clearTimeout);
    }, [isLoading]);

    // Auto-scroll to the newest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const isAllowedTopic = (text) => {
        const pattern = /wsu|course|class|degree|credit|major|schedule|ucore|advising|prerequisite|take|register|enroll|graduate|semester|gpa|grade|meet|seat|open|section|offered|available|instructor|waitlist|when\s+is|what\s+time|[a-z]{2,6}(\s+[a-z]{1,2})?\s*\d{3}/i;
        return pattern.test(text);
    };

    const handleSend = async (e) => {
        if (e) e.preventDefault();
        if (!input.trim() || isLoading) return;

        if (!isAllowedTopic(input)) {
            setError("Please keep questions focused on WSU academic advising, courses, or degree planning.");
            return;
        }

        setError(null);
        setIsLoading(true);
        const userMsg = input;
        setInput('');

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

    // Keyboard shortcut: Enter to send (Shift+Enter for new line)
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors duration-300">

            {/* Header */}
            <div className="p-4 bg-wsu-crimson dark:bg-red-900 text-white border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <GraduationCap size={24} />
                <h2 className="text-lg font-semibold">Virtual Academic Advisor</h2>
            </div>

            {/* Message History Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-gray-50 dark:bg-gray-900">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 space-y-4">
                        <GraduationCap size={48} className="opacity-20" />
                        <p className="text-center max-w-md">
                            Welcome! I can help you plan your degree, check prerequisites, or find courses that fit your schedule. What would you like to know?
                        </p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

                            {/* Avatar */}
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-wsu-crimson text-white'
                                }`}>
                                {msg.role === 'user' ? <User size={16} /> : <GraduationCap size={16} />}
                            </div>

                            {/* Message Bubble */}
                            <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`px-4 py-3 rounded-2xl ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-tr-none'
                                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-tl-none shadow-sm'
                                    }`}>
                                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                </div>

                                {/* Source Citations */}
                                {msg.sources && msg.sources.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium py-1">Sources:</span>
                                        {msg.sources.map((source, sIdx) => (
                                            <span key={sIdx} className="text-[10px] px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md">
                                                {source}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}

                {/* Loading Indicator */}
                {isLoading && (
                    <div className="flex gap-4 flex-row">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-wsu-crimson text-white flex items-center justify-center">
                            <GraduationCap size={16} />
                        </div>
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                            <span className="w-2 h-2 bg-wsu-crimson rounded-full animate-pulse"></span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 italic">{statusMsg}</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                {error && <p className="text-xs text-red-500 mb-2 px-1">{error}</p>}
                <form onSubmit={handleSend} className="relative flex items-end gap-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about WSU courses or degree requirements... (Press Enter to send)"
                        className="w-full resize-none bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl py-3 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        rows="2"
                        maxLength={500}
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 bottom-2 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
}