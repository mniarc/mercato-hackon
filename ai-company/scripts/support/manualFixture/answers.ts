/** Structural fixture interpretation of the actual portal response, not prewritten business answers. */
export function explicitAnswers(originalText: string, questions: Array<{ question_id: string; question: string }>) {
  const annotations = [...originalText.matchAll(/^\d+\. „([\s\S]*?)"\r?\n\s*→ ([\s\S]*?)(?=\r?\n\r?\n\d+\. „|$)/gm)]
  return questions.flatMap((question) => {
    const values = new Set<string>()
    for (const line of originalText.split(/\r?\n/)) {
      const prefix = `${question.question_id}:`
      if (line.trim().startsWith(prefix)) {
        const value = line.trim().slice(prefix.length).trim()
        if (value) values.add(value)
      }
    }
    for (const annotation of annotations) {
      if (annotation[1].trim() === question.question.trim() && annotation[2].trim()) values.add(annotation[2].trim())
    }
    if (values.size !== 1) return []
    const value = [...values][0]
    return originalText.includes(value) ? [{ questionId: question.question_id, value, quote: value }] : []
  })
}
