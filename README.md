```
██╗      ██████╗ ██╗      ██████╗ ███████╗ ██████╗ ██╗     ████████╗ ██████╗  ██████╗ ██╗     ███████╗
██║     ██╔═══██╗██║     ██╔═══██╗██╔════╝██╔═══██╗██║     ╚══██╔══╝██╔═══██╗██╔═══██╗██║     ██╔════╝
██║     ██║   ██║██║     ██║   ██║███████╗██║   ██║██║        ██║   ██║   ██║██║   ██║██║     ███████╗
██║     ██║   ██║██║     ██║   ██║╚════██║██║▄▄ ██║██║        ██║   ██║   ██║██║   ██║██║     ╚════██║
███████╗╚██████╔╝███████╗╚██████╔╝███████║╚██████╔╝███████╗   ██║   ╚██████╔╝╚██████╔╝███████╗███████║
╚══════╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝ ╚══▀▀═╝ ╚══════╝   ╚═╝    ╚═════╝  ╚═════╝ ╚══════╝╚══════╝
```

MCP server that validates, formats, and generates SQL objects following BSG Institute standardization rules — integrated with Claude Code.

## Tools

| Tool | Description |
|---|---|
| `validate_object_name` | Validates names for tables, views, SPs, functions, triggers, fields, and constraints |
| `validate_sql_object` | Full structural validation with compliance score (0–100) |
| `check_performance_patterns` | Detects anti-patterns: missing TRY/CATCH, SELECT *, implicit cursors, etc. |
| `check_audit_fields` | Verifies mandatory audit fields (Estado, UsuarioCreacion, FechaCreacion, etc.) |
| `generate_template` | Generates a complete BSG-compliant SQL template for any object type |
| `format_sql` | Applies BSG formatting: keyword casing, leading-comma columns, clause indentation |
| `suggest_alias` | Generates PascalCase-based table aliases with conflict detection |
| `generate_production_request` | Generates a formatted production deployment request email |
| `generate_access_request` | Generates a formatted database access request email |
| `get_rules` | Returns BSG standardization rules filtered by object type and/or topic |

## Requirements

- Node.js 18 or higher
- Claude Code (CLI)

## Installation

### Windows (PowerShell)

1. Clone or download this repository
2. Run the installer:

```powershell
.\install.ps1
```

Custom install path:

```powershell
.\install.ps1 -InstallPath "D:\tools\lolosqltools"
```

3. Restart Claude Code

### Manual installation

```bash
npm install
npm run build
```

Then register the MCP in `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "lolosqltools": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"]
    }
  }
}
```

Restart Claude Code.

## CLAUDE.md instructions

Add this block to your `~/.claude/CLAUDE.md` to make Claude use LOLOSQLTOOLS automatically:

```markdown
## LOLOSQLTOOLS MCP instructions for CLAUDE.md

The `lolosqltools` MCP is ALWAYS available. For any SQL object (table, view, SP, function, trigger), you MUST use it:

| Situation | Tool |
|---|---|
| Create a new SQL object | `generate_template` first, then deliver to user |
| Validate an object name | `validate_object_name` |
| Review an existing SQL block | `validate_sql_object` + `check_performance_patterns` |
| Format SQL | `format_sql` |
| Suggest a table alias | `suggest_alias` |
| Verify audit fields | `check_audit_fields` |
| Generate production deployment email | `generate_production_request` |
| Generate access request | `generate_access_request` |
| User asks about a BSG rule | `get_rules` |

**Critical rule**: NEVER generate SQL manually without consulting this MCP first.
```

## Development

```bash
npm run dev    # Run with tsx (no build needed)
npm run build  # Compile TypeScript → dist/
npm start      # Run compiled output
```

## License

MIT
