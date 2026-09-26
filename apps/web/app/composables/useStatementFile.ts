/**
 * A bank statement file as text, whatever the bank wrote it in.
 *
 * `File.text()` reads UTF-8 only, and Romanian banks' exports are often Windows-1250: a header with
 * diacritics ("Dată", "Sumă") came out garbled and the file was refused as having no header, and
 * without them the payers' names were stored as "POPESCU �TEF�NI��" (QA of 26 September 2026).
 * UTF-8 is tried first, strictly: a Windows-1250 file with any letter outside ASCII is not valid
 * UTF-8, and one without such letters reads the same either way.
 */
export const decodeStatement = (bytes: ArrayBuffer | Uint8Array): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1250").decode(bytes);
  }
};

/** Read in the browser, decoded as above. */
export const readStatementFile = async (file: Blob): Promise<string> =>
  decodeStatement(await file.arrayBuffer());
