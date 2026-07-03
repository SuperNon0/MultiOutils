import { useCallback, useRef, useState } from 'react';
import type { EditorDoc } from './model';

export interface History {
  doc: EditorDoc;
  /** Mutation validée → poussée dans l'historique (undo illimité, docs/00 §2.2). */
  commit(next: EditorDoc): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  /** Réinitialise l'historique (chargement d'un document). */
  reset(doc: EditorDoc): void;
}

export function useHistory(initial: EditorDoc): History {
  const [doc, setDoc] = useState<EditorDoc>(initial);
  const undoStack = useRef<EditorDoc[]>([]);
  const redoStack = useRef<EditorDoc[]>([]);
  // compteur uniquement pour rafraîchir canUndo/canRedo
  const [, setTick] = useState(0);
  const docRef = useRef(doc);
  docRef.current = doc;

  const commit = useCallback((next: EditorDoc) => {
    undoStack.current.push(docRef.current);
    redoStack.current = [];
    setDoc(next);
    setTick((t) => t + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(docRef.current);
    setDoc(prev);
    setTick((t) => t + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(docRef.current);
    setDoc(next);
    setTick((t) => t + 1);
  }, []);

  const reset = useCallback((fresh: EditorDoc) => {
    undoStack.current = [];
    redoStack.current = [];
    setDoc(fresh);
    setTick((t) => t + 1);
  }, []);

  return {
    doc,
    commit,
    undo,
    redo,
    reset,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0
  };
}
