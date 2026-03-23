// frontend/config.js

// Using Window object to store global configuration
window.APP_CONFIG = {
    // If running locally, this will be localhost:5000.
    // In production (Railway), change this to your deployed backend URL.
    backendUrl: 'http://localhost:5000',

    // Utility to show beautiful, simple toast notifications
    showToast: (message, type = 'info') => {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Remove toast after 3 seconds
        setTimeout(() => {
            if (toast.parentNode === container) {
                container.removeChild(toast);
            }
        }, 3000);
    }
};
