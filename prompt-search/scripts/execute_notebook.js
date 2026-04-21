const { spawn } = require('child_process');
const path = require('path');

const ADVICE_SCRIPT = path.resolve(__dirname, 'advice.py');
const VENV_PYTHON   = path.resolve(__dirname, '../../prompt-search/venv/bin/python3');
const PYTHON_CMD    = require('fs').existsSync(VENV_PYTHON) ? VENV_PYTHON : (process.platform === 'win32' ? 'python' : 'python3');

function executeNotebook(notebookPath, parameters) {
    return new Promise((resolve, reject) => {
        const timeoutMs = parseInt(process.env.NOTEBOOK_TIMEOUT_MS) || 300000;

        const args = [
            ADVICE_SCRIPT,
            '--question',        parameters.question || '',
            '--student_context', JSON.stringify(parameters.student_context || {}),
            '--use_rag',         String(parameters.use_rag !== false),
        ];

        const proc = spawn(PYTHON_CMD, args, {
            env: { ...process.env },
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', d => { stdout += d.toString(); });
        proc.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error('Advice script timed out after 5 minutes'));
        }, timeoutMs);

        proc.on('close', code => {
            clearTimeout(timer);
            if (code !== 0) {
                return reject(new Error(`advice.py failed (code ${code}):\n${stderr}`));
            }
            try {
                const match = stdout.match(/\{[\s\S]*\}/);
                if (match) {
                    resolve(JSON.parse(match[0]));
                } else {
                    reject(new Error('No JSON found in advice.py output'));
                }
            } catch (err) {
                reject(new Error(`Failed to parse advice.py output: ${err.message}`));
            }
        });
    });
}

module.exports = { executeNotebook };
