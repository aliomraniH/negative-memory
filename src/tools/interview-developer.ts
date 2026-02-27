import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection';
import {
  generateInterviewQuestions,
  analyzeInterviewResponse,
} from '../services/claude-reasoning';
import { addAntiPattern } from './add-antipattern';
import type {
  InterviewDeveloperInput,
  InterviewOutput,
  AntiPattern,
} from '../types';

/**
 * Tool 7: interview_developer
 * Two-phase structured failure knowledge extraction.
 *
 * Phase 1 (generate_questions): Create session, generate targeted questions.
 * Phase 2 (process_response): Analyze a response, potentially create anti-pattern.
 */
export async function interviewDeveloper(
  input: InterviewDeveloperInput
): Promise<InterviewOutput> {
  if (input.phase === 'generate_questions') {
    return generateQuestionsPhase(input);
  } else if (input.phase === 'process_response') {
    return processResponsePhase(input);
  } else {
    throw new Error(`Unknown phase: ${input.phase}. Use 'generate_questions' or 'process_response'.`);
  }
}

async function generateQuestionsPhase(
  input: InterviewDeveloperInput
): Promise<InterviewOutput> {
  const sessionId = uuidv4();
  const techStack = input.tech_stack || [];
  const domains = input.domains || ['any'];

  // Fetch existing patterns for recognition-trigger questions
  let existingPatterns: AntiPattern[] = [];
  if (techStack.length > 0) {
    const result = await query(
      `SELECT * FROM anti_patterns
       WHERE tech_stack && $1
       ORDER BY times_surfaced DESC
       LIMIT 5`,
      [techStack]
    );
    existingPatterns = result.rows;
  }

  // Generate questions using Claude
  const questions = await generateInterviewQuestions(techStack, domains, existingPatterns);

  // Store questions in interview_responses (with empty developer_response)
  for (const q of questions) {
    await query(
      `INSERT INTO interview_responses (session_id, question_category, question_text, developer_response)
       VALUES ($1, $2, $3, '')`,
      [sessionId, q.category, q.question]
    );
  }

  return {
    session_id: sessionId,
    phase: 'questions_generated',
    questions,
    message: `Generated ${questions.length} interview questions. Present them to the developer one at a time, then use process_response phase to submit each answer.`,
  };
}

async function processResponsePhase(
  input: InterviewDeveloperInput
): Promise<InterviewOutput> {
  if (!input.session_id) {
    throw new Error('session_id is required for process_response phase');
  }
  if (!input.developer_response) {
    throw new Error('developer_response is required for process_response phase');
  }

  const questionCategory = input.question_category || 'general';
  const questionText = input.question_text || 'Developer-initiated response';

  // Store the response
  const responseId = uuidv4();
  await query(
    `INSERT INTO interview_responses (id, session_id, question_category, question_text, developer_response)
     VALUES ($1, $2, $3, $4, $5)`,
    [responseId, input.session_id, questionCategory, questionText, input.developer_response]
  );

  // Analyze the response for potential anti-patterns
  const techStack = input.tech_stack || [];
  const analysis = await analyzeInterviewResponse(input.developer_response, techStack);

  let generatedAntipattern: AntiPattern | null = null;

  if (analysis) {
    // Create the anti-pattern
    const result = await addAntiPattern(analysis);
    generatedAntipattern = result.antipattern;

    // Link the anti-pattern to the interview response
    await query(
      `UPDATE interview_responses SET generated_antipattern_id = $1 WHERE id = $2`,
      [generatedAntipattern.id, responseId]
    );
  }

  return {
    session_id: input.session_id,
    phase: 'response_processed',
    generated_antipattern: generatedAntipattern,
    message: generatedAntipattern
      ? `Response analyzed: new anti-pattern created — "${generatedAntipattern.title}" (${generatedAntipattern.severity})`
      : 'Response analyzed: no specific anti-pattern extracted. The response may be too general or not describe a coding mistake.',
  };
}
