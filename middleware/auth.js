function ensureAuthenticated(req, res, next) {
  if (typeof req.isAuthenticated === 'function' && req.isAuthenticated()) {
    return next();
  }
  return res.redirect('/auth/login');
}

function checkAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.send("Accès refusé : vous n'êtes pas administrateur.");
}

module.exports = {
  ensureAuthenticated,
  checkAdmin
};
