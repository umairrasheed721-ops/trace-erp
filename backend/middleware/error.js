const errorHandler = (err, req, res, next) => {
  console.error('❌ API Error:', err);
  
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(status).json({
    success: false,
    message,
    data: process.env.NODE_ENV === 'development' ? err.stack : null
  });
};

module.exports = errorHandler;
