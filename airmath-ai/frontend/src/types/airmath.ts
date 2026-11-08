export type Gesture = "idle" | "draw" | "erase" | "submit" | "clear";

export type Point = {
  x: number;
  y: number;
  t: number;
  pressure: number;
};

export type Stroke = {
  id: string;
  color: string;
  width: number;
  mode: "ink" | "erase";
  points: Point[];
};

export type SolutionMessage = {
  type: "solution";
  ocr: {
    text: string;
    latex: string;
    confidence: number;
    provider: string;
  };
  normalizedExpression: string;
  result: string;
  steps: string[];
  answerText: string;
};

export type ErrorMessage = {
  type: "error";
  message: string;
};

export type TutorMessage = {
  type: "tutor";
  answer: string;
};

export type ServerMessage = SolutionMessage | ErrorMessage | TutorMessage;
