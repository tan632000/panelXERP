"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import {
  appendDocumentFiles,
  resolveFileValidationMessage,
  sumDocumentBytes,
  validateDocumentFiles,
  type FileValidationRules,
} from "@/kernel/core/lib/files";

export interface StoredDocument {
  id: number;
  fileSize: number | string;
}

interface UseDocumentFormStateOptions {
  validationNamespace: string;
  fileRules: FileValidationRules;
  existingDocuments?: StoredDocument[];
}

export function useDocumentFormState({
  validationNamespace,
  fileRules,
  existingDocuments = [],
}: UseDocumentFormStateOptions) {
  const tValidation = useTranslations(validationNamespace);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [removedDocumentIds, setRemovedDocumentIds] = useState<number[]>([]);
  const [selectionError, setSelectionError] = useState<string | undefined>();

  const existingDocumentBytes = useMemo(
    () => sumDocumentBytes(existingDocuments, removedDocumentIds),
    [existingDocuments, removedDocumentIds],
  );

  const resolveErrorMessage = useCallback(
    (error: "format" | "size" | null) =>
      resolveFileValidationMessage((key) => tValidation(key), error),
    [tValidation],
  );

  const documentError = useMemo(() => {
    if (selectionError) return selectionError;
    if (pendingFiles.length === 0) return undefined;

    return resolveErrorMessage(
      validateDocumentFiles(existingDocumentBytes, pendingFiles, fileRules),
    );
  }, [
    existingDocumentBytes,
    fileRules,
    pendingFiles,
    resolveErrorMessage,
    selectionError,
  ]);

  const resetDocumentState = useCallback(() => {
    setPendingFiles([]);
    setRemovedDocumentIds([]);
    setSelectionError(undefined);
  }, []);

  const selectFiles = useCallback(
    (incomingFiles: File[]) => {
      if (incomingFiles.length === 0) return false;

      const { files: nextFiles, error } = appendDocumentFiles(
        existingDocumentBytes,
        pendingFiles,
        incomingFiles,
        fileRules,
      );

      if (error) {
        setSelectionError(resolveErrorMessage(error));
        return false;
      }

      setSelectionError(undefined);
      setPendingFiles(nextFiles);
      return true;
    },
    [existingDocumentBytes, fileRules, pendingFiles, resolveErrorMessage],
  );

  const removePendingFile = useCallback(
    (index: number) => {
      setPendingFiles(pendingFiles.filter((_, i) => i !== index));
      setSelectionError(undefined);
    },
    [pendingFiles],
  );

  const removeExistingDocument = useCallback((documentId: number) => {
    setRemovedDocumentIds((current) =>
      current.includes(documentId) ? current : [...current, documentId],
    );
  }, []);

  const validateDocumentsBeforeSave = useCallback((): boolean => {
    const fileError = validateDocumentFiles(
      existingDocumentBytes,
      pendingFiles,
      fileRules,
    );
    if (fileError) {
      setSelectionError(resolveErrorMessage(fileError));
      return false;
    }

    setSelectionError(undefined);
    return true;
  }, [existingDocumentBytes, fileRules, pendingFiles, resolveErrorMessage]);

  return {
    pendingFiles,
    removedDocumentIds,
    documentError,
    resetDocumentState,
    selectFiles,
    removePendingFile,
    removeExistingDocument,
    validateDocumentsBeforeSave,
  };
}
