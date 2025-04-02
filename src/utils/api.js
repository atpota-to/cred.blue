/**
 * Utility functions for API interactions
 */

/**
 * Makes a fetch request with proper error handling, timeouts, and authentication.
 * 
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} [timeout=10000] - Timeout in milliseconds
 * @returns {Promise<Object>} - The JSON response or error object
 */
export const fetchWithTimeout = async (url, options = {}, timeout = 10000) => {
  // Always include credentials for session cookies
  const fetchOptions = {
    ...options,
    credentials: 'include',
  };

  // Set up abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    
    // Clear the timeout regardless of the outcome
    clearTimeout(timeoutId);
    
    // Check if the response was ok (status in the range 200-299)
    if (!response.ok) {
      // Try to get the error message from the response body
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorData.details;
      } catch (e) {
        // If we can't parse the error as JSON, use the status text
        errorMessage = response.statusText;
      }
      
      // Create an error object with useful properties
      const error = new Error(errorMessage || `HTTP error ${response.status}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.url = url;
      
      // Handle auth errors specifically
      if (response.status === 401) {
        error.isAuthError = true;
      }
      
      throw error;
    }
    
    // Parse the JSON response
    const data = await response.json();
    return data;
  } catch (error) {
    // Clear the timeout if we catch an error before it fires
    clearTimeout(timeoutId);
    
    // Enhance error with more context
    if (error.name === 'AbortError') {
      error.message = `Request timed out after ${timeout}ms: ${url}`;
      error.isTimeout = true;
    } else if (error.message && error.message.includes('Network request failed')) {
      error.isNetworkError = true;
    }
    
    // Add the URL to the error for context
    error.url = url;
    
    throw error;
  }
};

/**
 * Fetch data with retries for more reliability
 * 
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} [maxRetries=2] - Maximum number of retries
 * @param {number} [timeout=10000] - Timeout in milliseconds
 * @returns {Promise<Object>} - The JSON response or error object
 */
export const fetchWithRetry = async (url, options = {}, maxRetries = 2, timeout = 10000) => {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // If not the first attempt, wait increasing time before retry
      if (attempt > 0) {
        const backoffTime = 1000 * attempt; // 1s, 2s, 3s, etc.
        console.log(`Retry attempt ${attempt}/${maxRetries} for ${url} after ${backoffTime}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
      
      return await fetchWithTimeout(url, options, timeout);
    } catch (error) {
      lastError = error;
      
      // Don't retry if it's an auth error - those won't go away with retries
      if (error.status === 401 || error.status === 403) {
        throw error;
      }
      
      // Don't retry if it's a client error (4xx range) except for 408 (timeout) and 429 (rate limit)
      if (error.status && error.status >= 400 && error.status < 500 && 
          error.status !== 408 && error.status !== 429) {
        throw error;
      }
      
      // Log the error but continue if we have more retries
      console.warn(`Fetch attempt ${attempt + 1}/${maxRetries + 1} failed for ${url}:`, error.message);
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        error.message = `Failed after ${maxRetries + 1} attempts: ${error.message}`;
        throw error;
      }
    }
  }
  
  // We shouldn't get here, but just in case
  throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`);
}; 