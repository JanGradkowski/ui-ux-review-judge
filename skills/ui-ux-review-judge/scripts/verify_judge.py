"""Checks a judge subagent's transcript before its score is trusted.

usage: python verify_judge.py <agentId | latest> [--skill design:design-critique] [--allow <folder>] [--projects <dir>]

Reports:
  - whether the judge invoked the required skill with the Skill tool, and whether it did so before it opened any
    screenshot (the review has to be structured by that skill, not dressed up afterwards);
  - file writes outside the allowed folder (the judge's own scratch folder);
  - commands and written scripts that look like sign-in, form submission, non-GET requests, git, database or package
    operations, so you can read them in the transcript;
  - the score from the judge's final message.
Exit code: 0 valid and clean, 1 the skill call is missing (discard the round), 2 valid but with flags to read.
"""
import argparse
import glob
import json
import os
import re
import sys

RISKY = [
    (r'\.fill\(|\.type\(|password', 'types into fields or mentions a password'),
    (r"method\s*:\s*['\"](POST|PUT|PATCH|DELETE)|-X\s*(POST|PUT|PATCH|DELETE)|request\.(post|put|patch|delete)\(|\.(post|put|patch|delete)\(", 'non-GET request'),
    (r'\.submit\(|requestSubmit|type=submit|\[type="?submit', 'form submission'),
    (r'\bgit\s+(commit|push|checkout|reset|merge|rebase|stash|clean)\b', 'git operation'),
    (r'\b(psql|mysql|sqlite3|mongo|redis-cli|docker\s+exec)\b|\b(drop|delete\s+from|update\s+\w+\s+set|insert\s+into)\b', 'database operation'),
    (r'\b(npm|pnpm|yarn)\s+(install|add|remove|publish)\b|\bpip\s+install\b|mvnw?\b|gradlew?\b', 'package or build operation'),
    (r'\brm\s+-rf?\b|Remove-Item|\bdel\s+/', 'deletes files'),
    # A judge checking page.url() for /login (to stop when signed out) is fine; going to the sign-in page is not.
    (r'sign-in\.cjs|goto\([^)]*/(login|signin|sign-in)\b|/(logout|signout|sign-out)\b', 'sign-in or sign-out'),
]
WRITE_TOOLS = {'Write', 'Edit', 'MultiEdit', 'NotebookEdit'}
SHELL_TOOLS = {'Bash', 'PowerShell'}


def find_transcript(agent_id, projects):
    if agent_id == 'latest':
        files = glob.glob(os.path.join(projects, '*', '*', 'subagents', 'agent-*.jsonl'))
        if not files:
            raise SystemExit('no subagent transcripts under ' + projects)
        return max(files, key=os.path.getmtime)
    files = glob.glob(os.path.join(projects, '*', '*', 'subagents', 'agent-%s.jsonl' % agent_id))
    if not files:
        raise SystemExit('no transcript for agent %s under %s' % (agent_id, projects))
    return max(files, key=os.path.getmtime)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('agent')
    parser.add_argument('--skill', default='design:design-critique')
    parser.add_argument('--allow', action='append', default=[], help='folder the judge may write to (repeatable)')
    parser.add_argument('--projects', default=os.path.join(os.path.expanduser('~'), '.claude', 'projects'))
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')

    path = find_transcript(args.agent, args.projects)
    calls, texts = [], []
    with open(path, encoding='utf-8') as handle:
        for line in handle:
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            message = entry.get('message') or {}
            if message.get('role') != 'assistant' or not isinstance(message.get('content'), list):
                continue
            for block in message['content']:
                if block.get('type') == 'tool_use':
                    calls.append((block.get('name'), block.get('input') or {}))
                    # Some hosts deliver the subagent's final report through a hand-back tool, not as text.
                    report = (block.get('input') or {}).get('message')
                    if block.get('name') == 'SubagentHandback' and isinstance(report, str) and report.strip():
                        texts.append(report)
                elif block.get('type') == 'text' and block.get('text', '').strip():
                    texts.append(block['text'])

    allowed = [os.path.normcase(os.path.abspath(folder)) for folder in args.allow]
    skill_at = next((i for i, (name, data) in enumerate(calls) if name == 'Skill' and data.get('skill') == args.skill), None)
    first_shot = next((i for i, (name, data) in enumerate(calls)
                       if name == 'Read' and str(data.get('file_path', '')).lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))), None)
    flags = []
    for i, (name, data) in enumerate(calls):
        if name in WRITE_TOOLS:
            target = os.path.normcase(os.path.abspath(str(data.get('file_path') or data.get('notebook_path') or '')))
            if not any(target.startswith(folder) for folder in allowed):
                flags.append('#%d %s writes %s (outside the allowed folder)' % (i + 1, name, target))
            content = str(data.get('content') or data.get('new_string') or '')
        elif name in SHELL_TOOLS:
            content = str(data.get('command') or '')
        else:
            continue
        for pattern, why in RISKY:
            match = re.search(pattern, content, re.I)
            if match:
                flags.append('#%d %s: %s (%r)' % (i + 1, name, why, content[max(0, match.start() - 40):match.end() + 40].replace('\n', ' ')))

    final = texts[-1] if texts else ''
    scores = re.findall(r'(?i)score[^\n0-9]{0,30}(\d+(?:\.\d+)?)\s*/\s*10', final) or re.findall(r'(\d+(?:\.\d+)?)\s*/\s*10', final)

    print('transcript:', path)
    print('tool calls:', len(calls))
    if skill_at is None:
        print('SKILL: MISSING. %s was never invoked; the round does not count.' % args.skill)
    elif first_shot is not None and first_shot < skill_at:
        print('SKILL: LATE. %s was call #%d, after the first screenshot (call #%d); treat the round as invalid.' % (args.skill, skill_at + 1, first_shot + 1))
    else:
        print('SKILL: ok. %s was call #%d, before any screenshot.' % (args.skill, skill_at + 1))
    print('score:', scores[-1] + '/10' if scores else 'not found in the final message')
    print('flags:', 'none' if not flags else '')
    for flag in flags:
        print('  ' + flag)
    valid = skill_at is not None and (first_shot is None or skill_at < first_shot)
    sys.exit(0 if valid and not flags else (2 if valid else 1))


if __name__ == '__main__':
    main()
