const responseWrapper = (req, res, next) => {
  res.success = (data = null, message = 'Operation successful') => {
    res.json({
      success: true,
      data,
      message
    });
  };
  res.fail = (message = 'An error occurred', code = 500, data = null) => {
    res.status(code).json({
      success: false,
      message,
      data
    });
  };
  next();
};

module.exports = responseWrapper;
