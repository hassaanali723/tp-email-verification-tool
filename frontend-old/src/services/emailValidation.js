import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const getValidationStats = async (requestId) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/api/email-validation/stats/${requestId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching validation stats:', error);
        throw error;
    }
};

// ... existing code ... 