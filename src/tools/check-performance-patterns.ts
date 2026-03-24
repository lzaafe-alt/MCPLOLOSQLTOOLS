import { z } from "zod";

export const CheckPerformancePatternsSchema = z.object({
  sql: z.string().min(1, "SQL cannot be empty"),
  context: z.enum(["QUERY", "VIEW", "SP", "ALL"]).default("ALL"),
});

export type CheckPerformancePatternsInput = z.infer<typeof CheckPerformancePatternsSchema>;

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Category = "IO" | "CPU" | "MEMORY" | "LOCKING" | "DESIGN" | "INDEX";

interface PatternFound {
  pattern_id: string;
  pattern_name: string;
  category: Category;
  severity: Severity;
  description: string;
  consequence: string;
  bad_example: string;
  good_example: string;
  applies_to: string;
  detected_at?: string;
}

interface CheckPerformancePatternsResult {
  total_found: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  patterns_found: PatternFound[];
}

/* ── helpers ── */

function snippet(match: string): string {
  return match.trim().slice(0, 100);
}

function firstMatch(sql: string, re: RegExp): string | null {
  const m = sql.match(re);
  return m ? snippet(m[0]) : null;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/* ── Pattern definitions ── */

interface PatternDef {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  description: string;
  consequence: string;
  bad_example: string;
  good_example: string;
  applies_to: string[]; // "QUERY" | "VIEW" | "SP"
  detect(sql: string): string | null;
}

const PATTERNS: PatternDef[] = [
  /* ── PERF-001: SELECT * ── */
  {
    id: "PERF-001",
    name: "SELECT *",
    category: "IO",
    severity: "HIGH",
    description: "Using SELECT * retrieves all columns including unused ones, increasing I/O, network bandwidth, and preventing covering index usage.",
    consequence: "Excessive I/O, wasted network bandwidth, broken views when schema changes, prevents index-only scans.",
    bad_example: "SELECT * FROM [com].[T_Alumno]",
    good_example: "SELECT Id, Nombre, Apellido FROM [com].[T_Alumno]",
    applies_to: ["VIEW", "SP"],
    detect(sql) {
      return firstMatch(sql, /SELECT\s+\*/i);
    },
  },

  /* ── PERF-002: Non-SARGable filter ── */
  {
    id: "PERF-002",
    name: "Non-SARGable filter (function in WHERE)",
    category: "INDEX",
    severity: "HIGH",
    description: "Wrapping a column in a function (CAST, YEAR, MONTH, DAY, ISNULL, CONVERT) inside a WHERE clause prevents the query optimizer from using an index on that column.",
    consequence: "Full table or index scan instead of a seek; major performance degradation on large tables.",
    bad_example: "WHERE YEAR(FechaCreacion) = 2024",
    good_example: "WHERE FechaCreacion >= '2024-01-01' AND FechaCreacion < '2025-01-01'",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /WHERE[^;]*\b(CAST|YEAR|MONTH|DAY|ISNULL|CONVERT)\s*\(/i);
    },
  },

  /* ── PERF-003: Scalar UDF in SELECT ── */
  {
    id: "PERF-003",
    name: "Scalar UDF in SELECT",
    category: "CPU",
    severity: "HIGH",
    description: "Calling a scalar user-defined function (UDF) in the SELECT list causes row-by-row execution, effectively turning a set-based operation into a cursor-like loop.",
    consequence: "Severe CPU overhead; the UDF is executed once per row returned, inhibits parallelism.",
    bad_example: "SELECT Id, dbo.F_GetNombreCompleto(Id) AS Nombre FROM [com].[T_Alumno]",
    good_example: "Inline the logic or use a computed column / inline TVF instead of a scalar UDF.",
    applies_to: ["SP"],
    detect(sql) {
      return firstMatch(sql, /SELECT[^;]*(dbo|schema)\.\w+\s*\(/i);
    },
  },

  /* ── PERF-004: JOIN without index hint ── */
  {
    id: "PERF-004",
    name: "JOIN without verified indexes",
    category: "INDEX",
    severity: "LOW",
    description: "Every JOIN should have a supporting index on the join key columns. Without indexes, the engine may perform nested-loop full scans.",
    consequence: "Hash or merge joins replaced by nested-loop scans; exponential cost increase with table size.",
    bad_example: "SELECT * FROM T_A INNER JOIN T_B ON T_A.CodigoExterno = T_B.CodigoExterno",
    good_example: "Ensure index exists on T_A.CodigoExterno and T_B.CodigoExterno before joining.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /\b(INNER|LEFT|RIGHT|FULL)\s+JOIN\b/i);
    },
  },

  /* ── PERF-005: DISTINCT usage ── */
  {
    id: "PERF-005",
    name: "DISTINCT usage",
    category: "CPU",
    severity: "MEDIUM",
    description: "DISTINCT forces a sort and deduplication of the entire result set. It often hides underlying JOIN or data model problems (duplicate rows).",
    consequence: "Unnecessary sort operation; masks data model or JOIN defects that should be fixed at the root.",
    bad_example: "SELECT DISTINCT IdAlumno FROM [com].[T_AlumnoMateria]",
    good_example: "Fix the JOIN or subquery causing duplicates, or use GROUP BY with explicit aggregation.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /\bSELECT\s+DISTINCT\b/i);
    },
  },

  /* ── PERF-006: UNION instead of UNION ALL ── */
  {
    id: "PERF-006",
    name: "UNION instead of UNION ALL",
    category: "CPU",
    severity: "MEDIUM",
    description: "UNION performs a DISTINCT sort across both result sets to eliminate duplicates. If duplicates are not expected or don't matter, UNION ALL is always faster.",
    consequence: "Implicit sort + deduplication pass over potentially large combined result sets.",
    bad_example: "SELECT Id FROM T_A UNION SELECT Id FROM T_B",
    good_example: "SELECT Id FROM T_A UNION ALL SELECT Id FROM T_B -- if duplicates are acceptable",
    applies_to: ["SP"],
    detect(sql) {
      return firstMatch(sql, /\bUNION\b(?!\s+ALL)/i);
    },
  },

  /* ── PERF-007: Cursor usage ── */
  {
    id: "PERF-007",
    name: "Cursor usage",
    category: "CPU",
    severity: "CRITICAL",
    description: "Cursors iterate row-by-row, converting set-based SQL operations into procedural loops. They are almost always replaceable with set-based operations or window functions.",
    consequence: "Extremely slow execution on large data sets; high CPU and memory overhead; blocking other sessions.",
    bad_example: "DECLARE cur CURSOR FOR SELECT Id FROM T_Alumno\nFETCH NEXT FROM cur...",
    good_example: "Use INSERT...SELECT, UPDATE with JOIN, or window functions (ROW_NUMBER, SUM OVER) instead.",
    applies_to: ["SP"],
    detect(sql) {
      return firstMatch(sql, /\bDECLARE\s+\w+\s+CURSOR\b/i);
    },
  },

  /* ── PERF-008: WHILE loop ── */
  {
    id: "PERF-008",
    name: "WHILE loop",
    category: "CPU",
    severity: "HIGH",
    description: "WHILE loops process data row-by-row, similar to cursors. SQL Server is optimized for set-based operations.",
    consequence: "Row-by-row processing; high CPU, poor scalability, long execution times.",
    bad_example: "WHILE @i <= @max BEGIN ... SET @i = @i + 1 END",
    good_example: "Replace with a single set-based INSERT/UPDATE/DELETE or a batch approach using a numbers table.",
    applies_to: ["SP"],
    detect(sql) {
      return firstMatch(sql, /\bWHILE\s+/i);
    },
  },

  /* ── PERF-009: Temp table without index ── */
  {
    id: "PERF-009",
    name: "Temp table without index",
    category: "IO",
    severity: "MEDIUM",
    description: "Temporary tables used for intermediate results without a supporting index force full scans when queried with WHERE conditions.",
    consequence: "Full temp table scans on subsequent queries; tempdb I/O pressure.",
    bad_example: "SELECT Id, Nombre INTO #Temp FROM [com].[T_Alumno] WHERE Estado = 1\nSELECT * FROM #Temp WHERE Id = @Id",
    good_example: "CREATE INDEX IX_Temp_Id ON #Temp(Id) immediately after populating the temp table.",
    applies_to: ["SP"],
    detect(sql) {
      // Detect temp table creation
      const tempMatch = sql.match(/(?:SELECT\s+[\s\S]{0,200}?INTO\s+(#\w+)|CREATE\s+TABLE\s+(#\w+))/i);
      if (!tempMatch) return null;
      const tempName = (tempMatch[1] ?? tempMatch[2] ?? "").replace("#", "");
      // Check if CREATE INDEX references this temp table
      const hasIndex = new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?(?:CLUSTERED\\s+)?INDEX\\s+\\w+\\s+ON\\s+#${tempName}`, "i").test(sql);
      if (hasIndex) return null;
      return snippet(tempMatch[0]);
    },
  },

  /* ── PERF-010: Table variable (@table) ── */
  {
    id: "PERF-010",
    name: "Table variable (@table) usage",
    category: "MEMORY",
    severity: "MEDIUM",
    description: "Table variables lack statistics and do not support non-clustered indexes (pre-SQL 2014 without trace flag). For large intermediate sets, temp tables are preferable.",
    consequence: "Suboptimal execution plans due to missing statistics; row estimation defaults to 1 for table variables.",
    bad_example: "DECLARE @Resultados TABLE (Id INT, Nombre VARCHAR(100))\nINSERT INTO @Resultados SELECT ...",
    good_example: "Use #TempTable with statistics for large sets (> ~1000 rows); keep @table for small lookup sets.",
    applies_to: ["SP"],
    detect(sql) {
      return firstMatch(sql, /DECLARE\s+@\w+\s+TABLE\s*\(/i);
    },
  },

  /* ── PERF-011: Correlated subquery ── */
  {
    id: "PERF-011",
    name: "Correlated subquery",
    category: "CPU",
    severity: "HIGH",
    description: "A correlated subquery references a column from the outer query, causing it to re-execute once per row in the outer result set.",
    consequence: "N executions of the inner query where N = outer row count; exponential cost growth.",
    bad_example: "SELECT Id, (SELECT COUNT(*) FROM T_Materia m WHERE m.IdAlumno = a.Id) AS Total FROM T_Alumno a",
    good_example: "Use a JOIN with GROUP BY or a window function (COUNT() OVER) instead.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /SELECT[^;]*\(\s*SELECT[^)]*WHERE[^)]*\.\w+\s*=\s*\w+\.\w+/i);
    },
  },

  /* ── PERF-012: ORDER BY without TOP or OFFSET ── */
  {
    id: "PERF-012",
    name: "ORDER BY without TOP or OFFSET/FETCH",
    category: "MEMORY",
    severity: "MEDIUM",
    description: "An ORDER BY clause without TOP or OFFSET/FETCH forces a sort of the entire result set with no benefit if the caller discards ordering.",
    consequence: "Full sort of result set; tempdb spills for large sets; wasted memory grants.",
    bad_example: "SELECT Id, Nombre FROM [com].[T_Alumno] WHERE Estado = 1 ORDER BY Nombre",
    good_example: "Add TOP N, or use OFFSET x FETCH NEXT y ROWS ONLY for pagination.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      // Find ORDER BY not accompanied by TOP in preceding text or OFFSET in following text
      const orderByMatch = sql.match(/\bORDER\s+BY\b/i);
      if (!orderByMatch) return null;
      const idx = orderByMatch.index ?? 0;
      const before = sql.slice(Math.max(0, idx - 500), idx);
      const after = sql.slice(idx, Math.min(sql.length, idx + 200));
      const hasTop = /\bTOP\b/i.test(before);
      const hasOffset = /\bOFFSET\b/i.test(after);
      if (hasTop || hasOffset) return null;
      return snippet(orderByMatch[0]);
    },
  },

  /* ── PERF-013: GROUP BY + HAVING without WHERE ── */
  {
    id: "PERF-013",
    name: "GROUP BY + HAVING without WHERE",
    category: "CPU",
    severity: "MEDIUM",
    description: "Using HAVING to filter aggregated results without a preceding WHERE clause causes all rows to be aggregated before filtering, instead of filtering first to reduce the working set.",
    consequence: "Aggregation over full table; HAVING filter applied after full GROUP BY — far more expensive than pre-filtering with WHERE.",
    bad_example: "SELECT IdCurso, COUNT(*) FROM T_AlumnoMateria GROUP BY IdCurso HAVING COUNT(*) > 5",
    good_example: "SELECT IdCurso, COUNT(*) FROM T_AlumnoMateria WHERE Estado = 1 GROUP BY IdCurso HAVING COUNT(*) > 5",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      const hasGroupBy = /\bGROUP\s+BY\b/i.test(sql);
      const hasHaving = /\bHAVING\b/i.test(sql);
      if (!hasGroupBy || !hasHaving) return null;
      // Check if WHERE appears before GROUP BY
      const groupIdx = sql.search(/\bGROUP\s+BY\b/i);
      const whereIdx = sql.search(/\bWHERE\b/i);
      if (whereIdx >= 0 && whereIdx < groupIdx) return null;
      return snippet(sql.match(/\bGROUP\s+BY\b/i)?.[0] ?? "GROUP BY");
    },
  },

  /* ── PERF-014: LIKE with leading wildcard ── */
  {
    id: "PERF-014",
    name: "LIKE with leading wildcard",
    category: "INDEX",
    severity: "HIGH",
    description: "A LIKE pattern starting with '%' (e.g., '%texto') prevents index seeks because the engine cannot determine the starting point in the index B-tree.",
    consequence: "Full index or table scan for every execution; no seek possible regardless of indexes present.",
    bad_example: "WHERE Nombre LIKE '%Garcia'",
    good_example: "WHERE Nombre LIKE 'Garcia%' -- prefix search supports index seek\n-- Or use Full-Text Search for infix/suffix matching at scale.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /LIKE\s+'%[^']+/i);
    },
  },

  /* ── PERF-015: No pagination ── */
  {
    id: "PERF-015",
    name: "No pagination (no TOP or OFFSET/FETCH)",
    category: "IO",
    severity: "MEDIUM",
    description: "A SELECT statement that returns an unbounded result set (no TOP, no OFFSET/FETCH) can return millions of rows, overwhelming application memory and network.",
    consequence: "Unbounded result sets; application OOM risk; excessive network I/O; full table scans.",
    bad_example: "SELECT Id, Nombre FROM [com].[T_Alumno] WHERE Estado = 1",
    good_example: "SELECT TOP 1000 Id, Nombre FROM [com].[T_Alumno] WHERE Estado = 1\n-- or use OFFSET/FETCH for cursor-based pagination",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      // Only flag plain SELECT without TOP or OFFSET
      const hasSelect = /\bSELECT\b/i.test(sql);
      if (!hasSelect) return null;
      const hasTop = /\bTOP\b/i.test(sql);
      const hasOffset = /\bOFFSET\b/i.test(sql);
      if (hasTop || hasOffset) return null;
      return snippet(sql.match(/\bSELECT\b/i)?.[0] ?? "SELECT");
    },
  },

  /* ── PERF-016: Long transaction with WAITFOR ── */
  {
    id: "PERF-016",
    name: "Long transaction (WAITFOR inside BEGIN TRAN)",
    category: "LOCKING",
    severity: "CRITICAL",
    description: "Using WAITFOR inside an open transaction holds locks for the entire wait duration, potentially blocking all other sessions accessing the same resources.",
    consequence: "Lock escalation; blocking chains; deadlock risk; all other transactions waiting on those resources are blocked.",
    bad_example: "BEGIN TRAN\n  UPDATE T_Estado SET Valor = 1 WHERE Id = 1\n  WAITFOR DELAY '00:00:10'\nCOMMIT",
    good_example: "Never use WAITFOR inside a transaction. Do the wait outside the transaction scope.",
    applies_to: ["SP"],
    detect(sql) {
      return firstMatch(sql, /BEGIN\s+TRAN[\s\S]*?WAITFOR/i);
    },
  },

  /* ── PERF-017: Monolithic SP (> 100 lines) ── */
  {
    id: "PERF-017",
    name: "Monolithic stored procedure (> 100 lines)",
    category: "DESIGN",
    severity: "LOW",
    description: "Stored procedures exceeding ~100 lines of SQL logic become difficult to maintain, test, and optimize. They typically indicate a violation of single-responsibility principle.",
    consequence: "Hard to maintain; difficult to unit test individual sections; optimizer may generate poor plans for complex queries.",
    bad_example: "-- A 200-line SP doing SELECT, multiple UPDATEs, email sending, and logging in one block",
    good_example: "Split into focused SPs per operation: SP_T_Entidad_ObtenerDatos, SP_T_Entidad_ActualizarEstado, etc.",
    applies_to: ["SP"],
    detect(sql) {
      const lineCount = sql.split("\n").length;
      if (lineCount <= 100) return null;
      return `Procedure has ${lineCount} lines (threshold: 100)`;
    },
  },

  /* ── PERF-018: Nested SP calls (EXEC inside SP) ── */
  {
    id: "PERF-018",
    name: "Nested SP calls (EXEC inside SP body)",
    category: "DESIGN",
    severity: "MEDIUM",
    description: "Calling other stored procedures (EXEC/EXECUTE) from within an SP creates deep call chains that are hard to trace, test, and can lead to nested transaction issues.",
    consequence: "Difficult to debug; potential for savepoint and rollback inconsistencies; hidden performance costs from chained calls.",
    bad_example: "EXEC SP_T_Log_Insertar @Mensaje, @Usuario",
    good_example: "Consider inline logic or a dedicated logging mechanism. Document any necessary SP-to-SP calls explicitly.",
    applies_to: ["SP"],
    detect(sql) {
      return firstMatch(sql, /\b(EXEC|EXECUTE)\b/i);
    },
  },

  /* ── PERF-019: Nested views ── */
  {
    id: "PERF-019",
    name: "Nested views (view referencing another view)",
    category: "DESIGN",
    severity: "HIGH",
    description: "A view that queries another view (V_ prefix) creates layered query trees that the optimizer cannot always see through, leading to poor execution plans.",
    consequence: "Hidden joins and filters; optimizer plan degradation; maintenance nightmare — changing inner view breaks outer.",
    bad_example: "CREATE VIEW [com].[V_ResumenAlumno] AS SELECT * FROM [com].[V_AlumnoDetalle]",
    good_example: "Reference base tables (T_ prefix) directly in each view. Share logic via inline TVFs if needed.",
    applies_to: ["VIEW"],
    detect(sql) {
      return firstMatch(sql, /FROM\s+\[?\w+\]?\.\[?V_\w+\]?/i);
    },
  },

  /* ── PERF-020: NOLOCK hint ── */
  {
    id: "PERF-020",
    name: "NOLOCK (WITH NOLOCK) hint",
    category: "LOCKING",
    severity: "MEDIUM",
    description: "WITH(NOLOCK) reads uncommitted data (dirty reads), which can return inconsistent, duplicate, or missing rows. It is frequently misused as a performance shortcut.",
    consequence: "Dirty reads; phantom rows; inconsistent results; not a valid substitute for proper isolation level design.",
    bad_example: "SELECT Id FROM [com].[T_Alumno] WITH(NOLOCK)",
    good_example: "Use READ COMMITTED SNAPSHOT ISOLATION (RCSI) at the database level instead. Or use explicit snapshot isolation.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /WITH\s*\(\s*NOLOCK\s*\)/i);
    },
  },

  /* ── PERF-021: JOIN with OR condition ── */
  {
    id: "PERF-021",
    name: "JOIN with OR condition",
    category: "INDEX",
    severity: "HIGH",
    description: "OR conditions in JOIN ON clauses or WHERE clauses combined with JOINs prevent the optimizer from using a single index seek; it may resort to table scans or index unions.",
    consequence: "Optimizer cannot use a single index seek; possible full scans or expensive index union operations.",
    bad_example: "ON A.Id = B.IdAlumno OR A.CodigoAlt = B.CodigoAlumno",
    good_example: "Split into separate queries with UNION ALL, or redesign the data model to avoid OR-based joins.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      const hasJoin = /\bJOIN\b/i.test(sql);
      if (!hasJoin) return null;
      return firstMatch(sql, /\bON\b[^;]*\bOR\b/i) ?? firstMatch(sql, /\bWHERE\b[^;]*\bOR\b/i);
    },
  },

  /* ── PERF-022: Implicit type conversion ── */
  {
    id: "PERF-022",
    name: "Implicit type conversion risk",
    category: "INDEX",
    severity: "MEDIUM",
    description: "Comparing a numeric column to a string literal (or vice versa) forces an implicit conversion on every row, preventing index seeks and potentially causing data truncation.",
    consequence: "Index cannot be used for seeks; full scan + implicit cast per row; potential data loss or silent truncation.",
    bad_example: "WHERE IdAlumno = '12345'  -- numeric column compared to string",
    good_example: "WHERE IdAlumno = 12345  -- use the correct data type literal",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /=\s*N?'[0-9]+'/i);
    },
  },

  /* ── PERF-023: DISTINCT + ORDER BY ── */
  {
    id: "PERF-023",
    name: "DISTINCT + ORDER BY combination",
    category: "MEMORY",
    severity: "MEDIUM",
    description: "Combining DISTINCT and ORDER BY forces two sort operations: one for deduplication and one for ordering, both requiring memory grants.",
    consequence: "Double sort; potential tempdb spills; memory grant pressure affecting concurrent queries.",
    bad_example: "SELECT DISTINCT Nombre, Apellido FROM T_Alumno ORDER BY Apellido",
    good_example: "Use GROUP BY with explicit aggregation, then ORDER BY — or fix the root cause of duplicates.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /SELECT\s+DISTINCT[\s\S]*ORDER\s+BY/i);
    },
  },

  /* ── PERF-024: CROSS JOIN ── */
  {
    id: "PERF-024",
    name: "CROSS JOIN (cartesian product)",
    category: "MEMORY",
    severity: "HIGH",
    description: "CROSS JOIN produces a cartesian product (M × N rows). Unless intentional for small reference tables, it is a common source of runaway queries.",
    consequence: "Exponential row count explosion; out-of-memory errors; extreme CPU and tempdb pressure.",
    bad_example: "SELECT A.Nombre, B.Curso FROM T_Alumno A CROSS JOIN T_Curso B",
    good_example: "Use INNER JOIN with an explicit ON condition. Only use CROSS JOIN intentionally with tiny static tables.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /\bCROSS\s+JOIN\b/i);
    },
  },

  /* ── PERF-025: Repeated subquery ── */
  {
    id: "PERF-025",
    name: "Repeated subquery",
    category: "CPU",
    severity: "MEDIUM",
    description: "The same subquery appearing multiple times in a query forces the optimizer to execute it multiple times (unless it can merge them), wasting CPU and I/O.",
    consequence: "Redundant execution of the same subquery; avoidable I/O and CPU cost.",
    bad_example: "SELECT (SELECT MAX(Id) FROM T_A), (SELECT MAX(Id) FROM T_A) + 1",
    good_example: "Extract the repeated subquery into a CTE or a temp variable computed once.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      // Find all (SELECT ... ) blocks and look for duplicates
      const subqueries: string[] = [];
      const re = /\(\s*SELECT\b[^()]*\)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql)) !== null) {
        const normalized = m[0].replace(/\s+/g, " ").toLowerCase();
        if (subqueries.includes(normalized)) {
          return snippet(m[0]);
        }
        subqueries.push(normalized);
      }
      return null;
    },
  },

  /* ── PERF-026: Linked server / OPENQUERY ── */
  {
    id: "PERF-026",
    name: "Linked server or OPENQUERY usage",
    category: "IO",
    severity: "HIGH",
    description: "OPENQUERY and four-part linked server names pull data across network boundaries. The optimizer cannot push predicates into remote queries efficiently.",
    consequence: "Full remote table scans; unpredictable latency; single point of failure; difficult transactions.",
    bad_example: "SELECT * FROM OPENQUERY(RemoteServer, 'SELECT * FROM db.schema.table')",
    good_example: "Extract data via ETL/SSIS to local staging tables, or use replication/change data capture.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /\bOPENQUERY\b/i) ??
        firstMatch(sql, /\b\w+\.\w+\.\w+\.\w+\b/);
    },
  },

  /* ── PERF-027: NVARCHAR(MAX) / VARCHAR(MAX) in join or column ── */
  {
    id: "PERF-027",
    name: "NVARCHAR(MAX) or VARCHAR(MAX) in query",
    category: "MEMORY",
    severity: "MEDIUM",
    description: "MAX types are stored off-row for large values and cannot be indexed as join keys. Using them in WHERE or JOIN conditions degrades performance significantly.",
    consequence: "No index seek possible on MAX columns; LOB read overhead; increased memory pressure.",
    bad_example: "WHERE Descripcion = @Desc  -- Descripcion is NVARCHAR(MAX)",
    good_example: "Use bounded types (NVARCHAR(500)) for indexed/join columns. Reserve MAX types for large text content fields only.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /N?VARCHAR\s*\(\s*MAX\s*\)/i);
    },
  },

  /* ── PERF-028: No error handling in SP ── */
  {
    id: "PERF-028",
    name: "No TRY...CATCH error handling in SP",
    category: "DESIGN",
    severity: "MEDIUM",
    description: "A stored procedure without BEGIN TRY...BEGIN CATCH cannot gracefully handle errors, leaving transactions open or in an inconsistent state.",
    consequence: "Open transactions on error; inconsistent data state; cryptic error propagation to caller.",
    bad_example: "BEGIN\n  UPDATE T_Alumno SET Estado = 0 WHERE Id = @Id\nEND",
    good_example: "BEGIN TRY\n  UPDATE T_Alumno SET Estado = 0 WHERE Id = @Id\nEND TRY\nBEGIN CATCH\n  ROLLBACK; THROW;\nEND CATCH",
    applies_to: ["SP"],
    detect(sql) {
      // Only flag if it's a CREATE PROCEDURE/SP_ context
      const isProc = /\b(CREATE|ALTER)\s+(OR\s+ALTER\s+)?PROCEDURE\b/i.test(sql) ||
                     /\bSP_\w+\b/i.test(sql);
      if (!isProc) return null;
      if (/\bBEGIN\s+TRY\b/i.test(sql)) return null;
      return "Missing BEGIN TRY...BEGIN CATCH block in stored procedure";
    },
  },

  /* ── PERF-029: Temp table not dropped ── */
  {
    id: "PERF-029",
    name: "Temp table not explicitly dropped",
    category: "MEMORY",
    severity: "LOW",
    description: "Temporary tables that are not explicitly dropped at the end of a stored procedure persist for the session lifetime, consuming tempdb space and potentially causing conflicts on re-execution.",
    consequence: "Tempdb space leak; 'table already exists' errors on repeated SP calls in same session; connection pool confusion.",
    bad_example: "SELECT Id INTO #Temp FROM T_Alumno\n-- end of SP, no DROP TABLE",
    good_example: "IF OBJECT_ID('tempdb..#Temp') IS NOT NULL DROP TABLE #Temp\n-- at end of SP (or in CATCH block)",
    applies_to: ["SP"],
    detect(sql) {
      const tempMatch = sql.match(/(?:SELECT\s+[\s\S]{0,200}?INTO\s+(#\w+)|CREATE\s+TABLE\s+(#\w+))/i);
      if (!tempMatch) return null;
      const tempName = (tempMatch[1] ?? tempMatch[2] ?? "").replace("#", "");
      const hasDrop = new RegExp(`DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?#?${tempName}`, "i").test(sql);
      if (hasDrop) return null;
      return snippet(tempMatch[0]);
    },
  },

  /* ── PERF-030: Deep CTE nesting (3+) ── */
  {
    id: "PERF-030",
    name: "Deep CTE nesting (3+ CTEs)",
    category: "DESIGN",
    severity: "MEDIUM",
    description: "More than 2 chained CTEs in a single query can confuse the optimizer, which may materialize each CTE separately or generate inefficient plans for deeply nested logic.",
    consequence: "Sub-optimal execution plans; difficult to read and maintain; optimizer may not push predicates through CTE layers.",
    bad_example: ";WITH CTE1 AS (...), CTE2 AS (...), CTE3 AS (...), CTE4 AS (...) SELECT ...",
    good_example: "Break complex CTE chains into temp tables at natural checkpoints, or refactor into a view + SP pair.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      const matches = [...sql.matchAll(/,\s*\w+\s+AS\s*\(/gi)];
      if (matches.length < 2) return null;
      return `Found ${matches.length + 1} CTEs in query (threshold: 3)`;
    },
  },

  /* ── PERF-031: Neutral parameter default ── */
  {
    id: "PERF-031",
    name: "Neutral parameter default (= 0 or = NULL meaning 'all')",
    category: "DESIGN",
    severity: "LOW",
    description: "Using a parameter default of 0 or NULL to mean 'return all rows' creates a parameter-sniffing-prone 'catch-all' query that generates poor cached plans.",
    consequence: "Catch-all queries produce either the 'all rows' plan or the 'filtered' plan — whichever compiles first is cached and misapplied to the other case.",
    bad_example: "@IdAlumno INT = NULL -- NULL means 'all students'\nWHERE (@IdAlumno IS NULL OR Id = @IdAlumno)",
    good_example: "Create separate SPs for filtered vs. unfiltered retrieval. Or use OPTION(RECOMPILE) if necessary.",
    applies_to: ["SP"],
    detect(sql) {
      return firstMatch(sql, /@\w+\s+\w+\s*=\s*(0|NULL)\b/i);
    },
  },

  /* ── PERF-032: Functions in JOIN ON clause ── */
  {
    id: "PERF-032",
    name: "Function call in JOIN ON clause",
    category: "INDEX",
    severity: "HIGH",
    description: "Wrapping a column in a function within a JOIN ON clause prevents the optimizer from using an index seek on that column during join processing.",
    consequence: "Index seek replaced by full scan; applied per row during join; exponential cost for large tables.",
    bad_example: "JOIN T_Alumno A ON YEAR(A.FechaIngreso) = B.Anio",
    good_example: "Pre-compute or store the derived value; restructure the join condition to be index-friendly.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /\bON\b[^;]*(YEAR|MONTH|DAY|CAST|CONVERT|ISNULL)\s*\(/i);
    },
  },

  /* ── PERF-033: Mass DML without batch size control ── */
  {
    id: "PERF-033",
    name: "Mass INSERT/UPDATE without batch size control",
    category: "LOCKING",
    severity: "LOW",
    description: "Large INSERT or UPDATE operations without batch-size limits escalate locks, fill the transaction log, and block other sessions for extended periods.",
    consequence: "Lock escalation; long transaction log growth; blocking of OLTP queries during bulk operation.",
    bad_example: "UPDATE T_Alumno SET Estado = 0 WHERE FechaCreacion < '2020-01-01'  -- could be millions of rows",
    good_example: "WHILE 1 = 1 BEGIN\n  UPDATE TOP(1000) T_Alumno SET Estado = 0 WHERE ...\n  IF @@ROWCOUNT = 0 BREAK\nEND",
    applies_to: ["SP"],
    detect(sql) {
      return firstMatch(sql, /\b(INSERT\s+INTO|UPDATE)\b(?![\s\S]{0,300}\bTOP\b)/i);
    },
  },

  /* ── PERF-034: Multi-statement UDF ── */
  {
    id: "PERF-034",
    name: "Multi-statement table-valued UDF (MSTVF)",
    category: "CPU",
    severity: "HIGH",
    description: "Multi-statement TVFs (RETURNS @table TABLE ...) are opaque to the optimizer — they cannot be inlined, statistics are unavailable, and they execute row-by-row when used in JOINs.",
    consequence: "Row-count estimation defaults to 1; poor join strategies; no optimizer insight into the function body.",
    bad_example: "CREATE FUNCTION F_GetAlumnoMateria(@Id INT)\nRETURNS @Resultado TABLE (Id INT, Nombre VARCHAR(100))\nAS BEGIN ... END",
    good_example: "Replace with an inline TVF (single SELECT): RETURNS TABLE AS RETURN (SELECT ...)",
    applies_to: ["SP"],
    detect(sql) {
      return firstMatch(sql, /RETURNS\s+@\w+\s+TABLE/i);
    },
  },

  /* ── PERF-035: ORDER BY inside view definition ── */
  {
    id: "PERF-035",
    name: "ORDER BY inside VIEW definition (without TOP)",
    category: "DESIGN",
    severity: "MEDIUM",
    description: "ORDER BY inside a view definition (without TOP) is meaningless — SQL Server does not guarantee row order from a view. It adds a sort operation that callers may override anyway.",
    consequence: "Misleading ordering guarantee; unnecessary sort cost; blocked by SQL Server without TOP.",
    bad_example: "CREATE VIEW V_AlumnoOrdenado AS SELECT Id, Nombre FROM T_Alumno ORDER BY Nombre",
    good_example: "Remove ORDER BY from the view. Apply ORDER BY in the consuming query that knows the required ordering.",
    applies_to: ["VIEW"],
    detect(sql) {
      if (!/\bCREATE\b.*\bVIEW\b/i.test(sql)) return null;
      if (!/\bORDER\s+BY\b/i.test(sql)) return null;
      if (/\bTOP\b/i.test(sql)) return null;
      return firstMatch(sql, /\bORDER\s+BY\b/i);
    },
  },

  /* ── PERF-036: Indexed view on volatile table ── */
  {
    id: "PERF-036",
    name: "Indexed view on volatile table",
    category: "DESIGN",
    severity: "LOW",
    description: "Creating a UNIQUE CLUSTERED INDEX on a view that references frequently-updated tables causes maintenance overhead on every DML operation against the base tables.",
    consequence: "Every INSERT/UPDATE/DELETE on base tables must update the indexed view synchronously; heavy write amplification.",
    bad_example: "CREATE UNIQUE CLUSTERED INDEX IX_V_Resumen ON [com].[V_ResumenAlumno](Id)",
    good_example: "Only create indexed views on relatively static data. Consider materialized tables via scheduled refresh instead.",
    applies_to: ["VIEW"],
    detect(sql) {
      return firstMatch(sql, /CREATE\s+.*UNIQUE\s+.*CLUSTERED\s+.*INDEX\s+.*ON\s+.*V_/i);
    },
  },

  /* ── PERF-037: Scalar function in view SELECT ── */
  {
    id: "PERF-037",
    name: "Scalar function in VIEW SELECT columns",
    category: "CPU",
    severity: "HIGH",
    description: "Calling a scalar UDF inside a VIEW's SELECT list causes row-by-row function execution whenever the view is queried, defeating set-based query optimization.",
    consequence: "Row-by-row function calls; inhibits parallelism; hidden performance bottleneck for view consumers.",
    bad_example: "CREATE VIEW V_Alumno AS SELECT Id, dbo.F_GetNombre(Id) AS Nombre FROM T_Alumno",
    good_example: "Inline the function logic in the view SELECT, or use an inline TVF joined to the view.",
    applies_to: ["VIEW"],
    detect(sql) {
      if (!/\bCREATE\b.*\bVIEW\b/i.test(sql)) return null;
      return firstMatch(sql, /SELECT[^;]*dbo\.\w+\s*\([^)]*\).*FROM/i);
    },
  },

  /* ── PERF-038: Too many JOINs in view (> 5) ── */
  {
    id: "PERF-038",
    name: "Too many JOINs in view (> 5)",
    category: "DESIGN",
    severity: "MEDIUM",
    description: "A view with more than 5 JOINs creates complex query trees that are hard to optimize and maintain. It often signals a single view trying to do too much.",
    consequence: "Complex query plans; optimizer struggles with join order; any query on this view inherits the full join cost.",
    bad_example: "CREATE VIEW V_Resumen AS SELECT ... FROM T_A JOIN T_B JOIN T_C JOIN T_D JOIN T_E JOIN T_F JOIN T_G ...",
    good_example: "Split into focused views with fewer JOINs, or use CTEs in the consuming query.",
    applies_to: ["VIEW"],
    detect(sql) {
      const joinCount = (sql.match(/\b(INNER|LEFT|RIGHT|FULL|CROSS)\s+JOIN\b/gi) ?? []).length;
      if (joinCount <= 5) return null;
      return `Found ${joinCount} JOINs in view definition (threshold: 5)`;
    },
  },

  /* ── PERF-039: DISTINCT or GROUP BY inside view ── */
  {
    id: "PERF-039",
    name: "DISTINCT or GROUP BY inside VIEW definition",
    category: "CPU",
    severity: "MEDIUM",
    description: "A VIEW that contains DISTINCT or GROUP BY materializes a sort/aggregate on every query against it, even when the caller only needs a subset of rows.",
    consequence: "Mandatory aggregation/sort per query; the caller cannot push predicates through the GROUP BY.",
    bad_example: "CREATE VIEW V_MateriasUnicas AS SELECT DISTINCT IdCurso, Nombre FROM T_AlumnoMateria",
    good_example: "Remove aggregation from the view; let the consuming query decide when to aggregate.",
    applies_to: ["VIEW"],
    detect(sql) {
      if (!/\bCREATE\b.*\bVIEW\b/i.test(sql)) return null;
      return firstMatch(sql, /\bDISTINCT\b/i) ?? firstMatch(sql, /\bGROUP\s+BY\b/i);
    },
  },

  /* ── PERF-040: LEFT JOIN where INNER suffices ── */
  {
    id: "PERF-040",
    name: "LEFT JOIN negated by IS NOT NULL in WHERE",
    category: "INDEX",
    severity: "LOW",
    description: "A LEFT JOIN followed by a WHERE condition on the right table's column IS NOT NULL effectively converts the join to an INNER JOIN but forces the optimizer to plan for the outer join first.",
    consequence: "Optimizer plans for outer join semantics, then filters — inefficient; should use INNER JOIN directly.",
    bad_example: "SELECT A.Id FROM T_A A LEFT JOIN T_B B ON A.Id = B.IdA WHERE B.Id IS NOT NULL",
    good_example: "SELECT A.Id FROM T_A A INNER JOIN T_B B ON A.Id = B.IdA",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /LEFT\s+(OUTER\s+)?JOIN[\s\S]*?WHERE[\s\S]*?\.\w+\s+IS\s+NOT\s+NULL/i);
    },
  },

  /* ── PERF-041: Parameter sniffing risk ── */
  {
    id: "PERF-041",
    name: "Parameter sniffing risk (no OPTION RECOMPILE or OPTIMIZE FOR)",
    category: "DESIGN",
    severity: "LOW",
    description: "A stored procedure with multiple parameters and complex WHERE conditions, but no OPTION(RECOMPILE) or OPTIMIZE FOR hint, is susceptible to parameter sniffing — a cached plan optimized for one parameter value performing poorly for another.",
    consequence: "Cached plan for 'typical' values performs poorly for outlier values (e.g., searching for a rare vs. common category).",
    bad_example: "CREATE PROCEDURE SP_T_Alumno_Obtener @IdPais INT, @Activo BIT AS BEGIN SELECT ... WHERE IdPais = @IdPais END",
    good_example: "Add OPTION(OPTIMIZE FOR (@IdPais UNKNOWN)) or declare local variables and copy params into them.",
    applies_to: ["SP"],
    detect(sql) {
      const isProc = /\b(CREATE|ALTER)\s+(OR\s+ALTER\s+)?PROCEDURE\b/i.test(sql);
      if (!isProc) return null;
      const hasParams = (sql.match(/@\w+\s+\w+/g) ?? []).length >= 2;
      if (!hasParams) return null;
      if (/OPTION\s*\(\s*(RECOMPILE|OPTIMIZE\s+FOR)/i.test(sql)) return null;
      return "SP with multiple parameters lacks OPTION(RECOMPILE) or OPTIMIZE FOR hint";
    },
  },

  /* ── PERF-042: SELECT * in VIEW definition ── */
  {
    id: "PERF-042",
    name: "SELECT * in VIEW definition",
    category: "IO",
    severity: "HIGH",
    description: "Using SELECT * in a view definition creates a fragile dependency on table structure. Adding or removing columns from the base table silently changes the view's contract.",
    consequence: "Schema coupling; schema_name resolution failure after ALTER TABLE; excessive I/O; broken views.",
    bad_example: "CREATE VIEW V_Alumno AS SELECT * FROM [com].[T_Alumno]",
    good_example: "CREATE VIEW V_Alumno AS SELECT Id, Nombre, Apellido, Estado FROM [com].[T_Alumno]",
    applies_to: ["VIEW"],
    detect(sql) {
      if (!/\bCREATE\b.*\bVIEW\b/i.test(sql)) return null;
      return firstMatch(sql, /\bSELECT\s+\*/i);
    },
  },

  /* ── PERF-043: Complex CASE expressions (> 5 WHEN) ── */
  {
    id: "PERF-043",
    name: "Complex CASE expression (> 5 WHEN branches)",
    category: "CPU",
    severity: "LOW",
    description: "CASE expressions with more than 5 WHEN branches indicate complex business logic embedded in SQL. They are hard to maintain and can confuse the optimizer's statistics calculations.",
    consequence: "Maintenance difficulty; CASE evaluated per-row; optimizer cannot simplify complex CASE branches.",
    bad_example: "CASE Estado WHEN 1 THEN '...' WHEN 2 THEN '...' WHEN 3 ... WHEN 6 THEN '...' END",
    good_example: "Use a reference/lookup table or a computed column. Move complex CASE logic to the application layer.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      const whenCount = (sql.match(/\bWHEN\b/gi) ?? []).length;
      if (whenCount <= 5) return null;
      return `Found ${whenCount} WHEN branches in CASE expressions (threshold: 5)`;
    },
  },

  /* ── PERF-044: Collation mismatch ── */
  {
    id: "PERF-044",
    name: "Collation mismatch in JOIN/WHERE",
    category: "INDEX",
    severity: "MEDIUM",
    description: "Using COLLATE in JOIN or WHERE conditions indicates a collation mismatch between compared columns. This prevents index seeks and adds implicit conversion overhead.",
    consequence: "Index cannot be used for the comparison; implicit collation conversion per row; unpredictable sort orders.",
    bad_example: "JOIN T_B B ON A.Codigo = B.Codigo COLLATE Latin1_General_CI_AS",
    good_example: "Standardize collation at database or column level. Avoid runtime COLLATE in join conditions.",
    applies_to: ["SP", "VIEW"],
    detect(sql) {
      return firstMatch(sql, /\bCOLLATE\b/i);
    },
  },

  /* ── PERF-045: UPDATE/DELETE without WHERE ── */
  {
    id: "PERF-045",
    name: "UPDATE or DELETE without WHERE clause",
    category: "IO",
    severity: "CRITICAL",
    description: "An UPDATE or DELETE statement without a WHERE clause modifies ALL rows in the table. This is almost always a bug or oversight and can cause catastrophic data loss.",
    consequence: "ALL rows updated or deleted; potential full transaction log fill; data loss; may require restore from backup.",
    bad_example: "UPDATE [com].[T_Alumno] SET Estado = 0  -- no WHERE!",
    good_example: "UPDATE [com].[T_Alumno] SET Estado = 0 WHERE Id = @Id AND Estado = 1",
    applies_to: ["SP"],
    detect(sql) {
      // Find UPDATE or DELETE statements, check if they have a WHERE clause in their scope
      // Use a line-by-line approach to find the statement and look ahead for WHERE
      const lines = sql.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/\b(UPDATE|DELETE)\b/i.test(line)) continue;
        // Skip CTEs and subqueries (preceded by closing paren or comma context)
        // Look ahead 20 lines for WHERE
        let hasWhere = false;
        const lookAhead = Math.min(i + 20, lines.length);
        for (let j = i; j < lookAhead; j++) {
          if (/\bWHERE\b/i.test(lines[j])) { hasWhere = true; break; }
          // Stop at next statement boundary (rough heuristic)
          if (j > i && /^\s*(SELECT|INSERT|CREATE|ALTER|DROP|BEGIN|END|GO)\b/i.test(lines[j])) break;
        }
        if (!hasWhere) {
          return snippet(line);
        }
      }
      return null;
    },
  },
];

/* ── Context filtering ── */

function contextMatches(pattern: PatternDef, context: string): boolean {
  if (context === "ALL") return true;
  if (context === "QUERY") return true; // QUERY runs everything for generic SQL
  return pattern.applies_to.includes(context);
}

/* ── Main export ── */

export function checkPerformancePatterns(
  input: CheckPerformancePatternsInput
): CheckPerformancePatternsResult {
  const { sql, context } = input;
  const patternsFound: PatternFound[] = [];

  for (const pattern of PATTERNS) {
    if (!contextMatches(pattern, context)) continue;
    const detected = pattern.detect(sql);
    if (detected === null) continue;

    patternsFound.push({
      pattern_id: pattern.id,
      pattern_name: pattern.name,
      category: pattern.category,
      severity: pattern.severity,
      description: pattern.description,
      consequence: pattern.consequence,
      bad_example: pattern.bad_example,
      good_example: pattern.good_example,
      applies_to: pattern.applies_to.join(", "),
      detected_at: detected ?? undefined,
    });
  }

  // Sort by severity
  patternsFound.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  return {
    total_found: patternsFound.length,
    critical_count: patternsFound.filter((p) => p.severity === "CRITICAL").length,
    high_count: patternsFound.filter((p) => p.severity === "HIGH").length,
    medium_count: patternsFound.filter((p) => p.severity === "MEDIUM").length,
    low_count: patternsFound.filter((p) => p.severity === "LOW").length,
    patterns_found: patternsFound,
  };
}
