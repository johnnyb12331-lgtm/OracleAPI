const validateLogin = (data) => {
    if (typeof data !== 'object' || data === null) {
        return { valid: false, message: "Invalid request format" };
    }

    const { email, password } = data;

    if (!email) {
        return { valid: false, message: "Email is required" };
    }

    if (!password) {
        return { valid: false, message: "Password is required" };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
        return { valid: false, message: "Invalid email format" };
    }

     const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/; // At least 8 characters, 1 letter, and 1 number
    if (password && !passwordRegex.test(password)) {
        return { valid: false, message: "Password must be at least 8 characters long and contain at least one letter and one number" };
    }

    /*const passwordRegex = /^\d{1,}$/;
    if (password && !passwordRegex.test(password)) {
        return { valid: false, message: "Password must be numeric" };
    }*/

    return { valid: true };
};


const validateRegister = (data) => {
    if (typeof data !== 'object' || data === null) {
        return { valid: false, message: "Invalid request format" };
    }

    const { email, password } = data;

    if (!email) {
        return { valid: false, message: "Email is required" };
    }

    if (!password) {
        return { valid: false, message: "Password is required" };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
        return { valid: false, message: "Invalid email format" };
    }

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/; // At least 8 characters, 1 letter, and 1 number
    if (password && !passwordRegex.test(password)) {
        return { valid: false, message: "Password must be at least 8 characters long and contain at least one letter and one number" };
    }

    return { valid: true };
};


module.exports = 
{ 
    validateLogin,
    validateRegister
};