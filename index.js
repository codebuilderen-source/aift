const express = require('express');
const { Pool } = require('pg');
const app = express();

// Render 환경변수에 등록한 DATABASE_URL을 사용합니다.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', async (req, res) => {
  try {
    // 1. Neon DB에서 'users' 테이블의 'name'을 가져오는 예시
    const result = await pool.query('SELECT name FROM users LIMIT 1');
    const userName = result.rows[0] ? result.rows[0].name : "데이터 없음";

    // 2. 화면에 출력
    res.send(`<h1>안녕하세요! DB에서 가져온 이름: ${userName}</h1>`);
  } catch (err) {
    console.error(err);
    res.status(500).send("DB 연결 오류 발생");
  }
});

app.listen(3000, () => {
  console.log('Server is running!');
});
