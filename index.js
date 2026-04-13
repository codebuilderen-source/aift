// POST 요청을 처리하기 위한 미들웨어 설정 (index.js 상단)
app.use(express.urlencoded({ extended: true }));

// 사용자 추가 라우트
app.post('/add-user', async (req, res) => {
  const { username } = req.body;
  try {
    // Neon DB에 데이터 삽입 (테이블명이 users라고 가정)
    await pool.query('INSERT INTO users (name) VALUES ($1)', [username]);
    // 성공 후 메인 페이지로 다시 이동(새로고침 효과)
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.send("에러 발생");
  }
});
