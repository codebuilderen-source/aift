const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Render에 설정한 DATABASE_URL 환경변수를 사용하여 DB 연결 설정
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Neon(외부 접속) 연결 시 필수 설정
  }
});

app.get('/', async (req, res) => {
  try {
    // aift 테이블에서 name 칼럼 하나를 가져옴 (첫 번째 레코드 기준)
    const result = await pool.query('SELECT name FROM aift LIMIT 1');
    
    if (result.rows.length > 0) {
      const userName = result.rows[0].name;
      res.send(`<h1>안녕하세요 ${userName}</h1>님`);
    } else {
      res.send('<h1>데이터가 없습니다.</h1>');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Database connection error');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
