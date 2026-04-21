import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook for managing undo/redo history
 * @param {*} initialState - The initial state
 * @param {number} limit - Maximum number of history states (default: 50)
 * @returns {object} - { state, setState, undo, redo, canUndo, canRedo, clearHistory }
 */
export function useHistory(initialState, limit = 50) {
  // Current state
  const [state, setInternalState] = useState(initialState);

  // History stacks
  const [history, setHistory] = useState([initialState]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Track if we're in the middle of an undo/redo to prevent adding to history
  const isUndoRedoRef = useRef(false);

  // Set state and add to history
  const setState = useCallback((newState) => {
    // If this is an undo/redo operation, don't add to history
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      setInternalState(newState);
      return;
    }

    setInternalState(newState);

    setHistory((prevHistory) => {
      // Remove any future history (if we're not at the end)
      const newHistory = prevHistory.slice(0, currentIndex + 1);

      // Add new state
      newHistory.push(newState);

      // Limit history size
      if (newHistory.length > limit) {
        return newHistory.slice(newHistory.length - limit);
      }

      return newHistory;
    });

    setCurrentIndex((prevIndex) => {
      const newIndex = prevIndex + 1;
      return newIndex >= limit ? limit - 1 : newIndex;
    });
  }, [currentIndex, limit]);

  // Undo
  const undo = useCallback(() => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      isUndoRedoRef.current = true;
      setInternalState(history[newIndex]);
    }
  }, [currentIndex, history]);

  // Redo
  const redo = useCallback(() => {
    if (currentIndex < history.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      isUndoRedoRef.current = true;
      setInternalState(history[newIndex]);
    }
  }, [currentIndex, history]);

  // Check if undo/redo is available
  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([state]);
    setCurrentIndex(0);
  }, [state]);

  return {
    state,
    setState,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
  };
}

export default useHistory;
