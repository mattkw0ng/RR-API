// Middleware to check if a user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Please log in" });
  }
};

// Middleware to check if the user is an admin
const isAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    next();
  } else if (req.session && req.session.user && req.session.user.role === 'superadmin') {
    next();
  } else {
    res.status(403).json({ error: "Forbidden: Admin access required" });
  }
};

module.exports = {
  isAuthenticated,
  isAdmin,
}