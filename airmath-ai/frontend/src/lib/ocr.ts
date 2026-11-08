import { createWorker } from "tesseract.js";
import type { Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      logger: () => {},
    }).then(async (w) => {
      await w.setParameters({
        // PSM 7 = single text line — applies heuristics while still handling
        // free-form handwritten equations on a single line
        tessedit_pageseg_mode: "7" as unknown as undefined,
        // No character whitelist — let Tesseract output its best guess and rely
        // on normalizeMathOcr() for cleanup. The old whitelist caused Tesseract
        // to silently drop characters it couldn't match, often producing empty output.
        preserve_interword_spaces: "1",
      });
      return w;
    });
  }
  return workerPromise;
}

/** Normalize common OCR misreads into valid math symbols. */
function normalizeMathOcr(raw: string): string {
  let s = raw;
  // 1. Strip garbage characters and OCR noise (keep common math symbols)
  s = s.replace(/[%~&_\\|?!@#$"'`:,;{}[\]]/g, "");

  // Unicode math operators → ASCII equivalents
  s = s.replace(/\u00d7/g, "*");   // × → *
  s = s.replace(/\u00f7/g, "/");   // ÷ → /
  s = s.replace(/\u2212/g, "-");   // − (minus) → -
  s = s.replace(/\u2013/g, "-");   // en-dash → -
  s = s.replace(/\u2014/g, "-");   // em-dash → -
  s = s.replace(/\u00b2/g, "^2");  // ² → ^2
  s = s.replace(/\u00b3/g, "^3");  // ³ → ^3
  s = s.replace(/\u221a/g, "sqrt"); // √ → sqrt
  s = s.replace(/\u03c0/gi, "pi"); // π → pi
  s = s.replace(/\u221e/g, "inf"); // ∞ → inf
  s = s.replace(/\u2248/g, "~");   // ≈ → ~
  s = s.replace(/\u2260/g, "!=");  // ≠ → !=
  s = s.replace(/\u2264/g, "<=");  // ≤ → <=
  s = s.replace(/\u2265/g, ">=");  // ≥ → >=
  s = s.replace(/\u00b1/g, "+-");  // ± → +-

  // Superscript digits (Unicode)
  s = s.replace(/\u2070/g, "^0");   // ⁰
  s = s.replace(/\u00b9/g, "^1");   // ¹
  s = s.replace(/\u2074/g, "^4");   // ⁴
  s = s.replace(/\u2075/g, "^5");   // ⁵
  s = s.replace(/\u2076/g, "^6");   // ⁶
  s = s.replace(/\u2077/g, "^7");   // ⁷
  s = s.replace(/\u2078/g, "^8");   // ⁸
  s = s.replace(/\u2079/g, "^9");   // ⁹

  // Subscript digits
  s = s.replace(/\u2080/g, "_0");   // ₀
  s = s.replace(/\u2081/g, "_1");   // ₁
  s = s.replace(/\u2082/g, "_2");   // ₂
  s = s.replace(/\u2083/g, "_3");   // ₃
  s = s.replace(/\u2084/g, "_4");   // ₄
  s = s.replace(/\u2085/g, "_5");   // ₅
  s = s.replace(/\u2086/g, "_6");   // ₆
  s = s.replace(/\u2087/g, "_7");   // ₇
  s = s.replace(/\u2088/g, "_8");   // ₈
  s = s.replace(/\u2089/g, "_9");   // ₉

  // Common Tesseract misreads in math context
  s = s.replace(/\|/g, "1");   // pipe → 1
  s = s.replace(/O/g, "0");    // capital-O → 0
  s = s.replace(/o(?=\d)/g, "0"); // o before digit → 0

  // Fix common letter/symbol confusions for math
  s = s.replace(/\bl\b/g, "1");    // standalone l → 1
  s = s.replace(/\bI\b/g, "1");    // standalone I → 1
  s = s.replace(/\bS\b/g, "5");    // standalone S → 5 (in numeric context)

  // Convert 'x' or 'X' to '*' for multiplication when sandwiched between digits (e.g. 7 x 3 or 7x3)
  s = s.replace(/(?<=\d)\s*[xX]\s*(?=\d)/g, "*");
  s = s.replace(/=/g, "=");   // Ensure equals sign stays

  // Collapse multiple spaces
  s = s.replace(/\s+/g, " ");
  s = s.trim();

  // 2. Remove leading invalid operators (allow unary + or -, but strip others)
  s = s.replace(/^[*\/^=\s]+/, "");

  // 3. Remove trailing operators
  s = s.replace(/[*\/^=+\-\s]+$/, "");

  return s.trim();
}

/**
 * Run Tesseract OCR on a preprocessed canvas data URL.
 * Returns the recognized text. Runs entirely in the browser — no API keys needed.
 */
export async function recognizeText(imageDataUrl: string): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(imageDataUrl);
  return normalizeMathOcr(data.text);
}

/** Terminate the worker to free memory. */
export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
