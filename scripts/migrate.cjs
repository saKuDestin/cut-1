/**
 * 手动执行数据库迁移脚本
 * 用于 drizzle-kit 无法直接连接 TiDB Cloud 的情况
 */
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

// 从环境变量读取连接信息
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ 请设置 DATABASE_URL 环境变量");
  process.exit(1);
}

// 解析连接字符串
const url = new URL(connectionString);
const config = {
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  ssl: connectionString.includes("tidbcloud.com") ? { rejectUnauthorized: true } : undefined,
  multipleStatements: true,
};

async function runMigrations() {
  console.log(`\n🔌 连接数据库: ${config.host}:${config.port}/${config.database}`);
  const conn = await mysql.createConnection(config);
  console.log("✅ 数据库连接成功\n");

  // 创建迁移记录表（如果不存在）
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      hash VARCHAR(64) NOT NULL UNIQUE,
      created_at BIGINT NOT NULL
    )
  `);

  // 读取所有迁移文件
  const migrationsDir = path.join(__dirname, "../drizzle");
  const sqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`📂 发现 ${sqlFiles.length} 个迁移文件\n`);

  let appliedCount = 0;
  let skippedCount = 0;

  for (const file of sqlFiles) {
    const hash = file.replace(".sql", "");

    // 检查是否已执行过
    const [rows] = await conn.execute(
      "SELECT id FROM __drizzle_migrations WHERE hash = ?",
      [hash]
    );
    if (rows.length > 0) {
      console.log(`⏭️  跳过（已执行）: ${file}`);
      skippedCount++;
      continue;
    }

    // 读取并执行 SQL
    const sqlPath = path.join(migrationsDir, file);
    let sql = fs.readFileSync(sqlPath, "utf-8");

    // 清理 drizzle-kit 的特殊注释标记
    sql = sql.replace(/--> statement-breakpoint/g, ";");

    // 按分号拆分并逐条执行
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    console.log(`▶️  执行迁移: ${file} (${statements.length} 条语句)`);

    try {
      for (const stmt of statements) {
        await conn.execute(stmt);
      }

      // 记录已执行
      await conn.execute(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
        [hash, Date.now()]
      );

      console.log(`✅ 完成: ${file}`);
      appliedCount++;
    } catch (err) {
      // 忽略"列已存在"等幂等错误
      if (
        err.code === "ER_DUP_FIELDNAME" ||
        err.code === "ER_TABLE_EXISTS_ERROR" ||
        (err.message && err.message.includes("Duplicate column name"))
      ) {
        console.log(`⚠️  跳过（已存在）: ${file} - ${err.message}`);
        await conn.execute(
          "INSERT IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
          [hash, Date.now()]
        );
        appliedCount++;
      } else {
        console.error(`❌ 执行失败: ${file}`);
        console.error(`   错误: ${err.message}`);
        await conn.end();
        process.exit(1);
      }
    }
  }

  await conn.end();

  console.log(`\n🎉 迁移完成！`);
  console.log(`   已执行: ${appliedCount} 个`);
  console.log(`   已跳过: ${skippedCount} 个\n`);
}

runMigrations().catch((err) => {
  console.error("❌ 迁移失败:", err.message);
  process.exit(1);
});
