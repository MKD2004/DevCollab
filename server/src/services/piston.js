const PISTON_EXECUTE_URL = 'https://emkc.org/api/v2/piston/execute';

// Maps the app's editor language selector values to Piston's runtime slugs.
const LANGUAGE_MAP = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  cpp: 'cpp',
  java: 'java',
  go: 'go',
  rust: 'rust',
};

// Executes `code` against the public Piston API and returns a normalized
// result. Throws on network failure, an unsupported language, or a
// non-2xx response from Piston.
async function executeCode({ language, code }) {
  const pistonLanguage = LANGUAGE_MAP[language];
  if (!pistonLanguage) {
    throw new Error(`Unsupported language: ${language}`);
  }

  let response;
  try {
    response = await fetch(PISTON_EXECUTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: pistonLanguage,
        version: '*',
        files: [{ content: code }],
      }),
    });
  } catch (err) {
    throw new Error(`Failed to reach Piston: ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`Piston request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data.run) {
    throw new Error('Piston returned an unexpected response');
  }

  return {
    stdout: data.run.stdout ?? '',
    stderr: data.run.stderr ?? '',
    exitCode: data.run.code ?? null,
    compileOutput: data.compile?.stderr || data.compile?.stdout || '',
  };
}

module.exports = { executeCode };
