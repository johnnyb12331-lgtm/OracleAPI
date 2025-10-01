const validation = require('../utils/authValidator');

module.exports = (req, res, next) => {
    if (req.path === '/Login') {
        // Validate login data
        const loginValidation = validation.validateLogin(req.body);
        if (!loginValidation.valid) {
            return res.status(400).json({ message: loginValidation.message });
        } else {
            req.valid = true;
            next(); // Call the next middleware
        }
    } else if (req.path === '/Register') {
        // Validate registration data
        const registerValidation = validation.validateRegister(req.body);
        if (!registerValidation.valid) {
            return res.status(400).json({ message: registerValidation.message });
        } else {
            req.valid = true;
            next(); // Call the next middleware
        }
    } else {
        next(); // Call the next middleware for other routes (like Logout, RefreshToken)
    }
};
