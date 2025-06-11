// Store selected subreddits
let selectedSubreddits = new Set();

// Function to handle input changes and show/hide reset buttons
function setupResetButtons() {
    // Handle text inputs
    document.querySelectorAll('.modern-input').forEach(input => {
        const resetBtn = input.closest('.input-with-reset')?.querySelector('.reset-input') || 
                       input.closest('.upload-zone')?.querySelector('.reset-input');
        
        if (!resetBtn) return;
        
        // Initial state
        resetBtn.style.display = input.value ? 'flex' : 'none';
        
        // Handle input events
        input.addEventListener('input', () => {
            resetBtn.style.display = input.value ? 'flex' : 'none';
        });
        
        // Handle reset button click
        resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            input.value = '';
            resetBtn.style.display = 'none';
            input.dispatchEvent(new Event('input'));
            input.focus();
        });
    });
    
    // Special handling for file input
    const fileInput = document.getElementById('imageFile');
    const fileResetBtn = document.querySelector('.upload-zone .reset-input');
    
    if (fileInput && fileResetBtn) {
        fileInput.addEventListener('change', () => {
            fileResetBtn.style.display = fileInput.files.length > 0 ? 'flex' : 'none';
        });
        
        fileResetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.value = '';
            fileResetBtn.style.display = 'none';
            hidePreview();
        });
    }
}

// Function to reset the form and re-enable subreddit input
function resetForm() {
    // Clear all inputs
    document.getElementById('imageForm').reset();
    
    // Clear file input and preview
    document.getElementById('imageFile').value = '';
    hidePreview();
    
    // Clear selected subreddits
    selectedSubreddits.clear();
    updateSubredditDisplay();
    
    // Re-enable subreddit inputs
    document.getElementById('subredditInput').disabled = false;
    document.getElementById('addSubredditBtn').disabled = false;
    document.getElementById('confirmSubreddits').disabled = false;
    
    // Hide the reset button
    document.getElementById('resetForm').style.display = 'none';
    
    // Clear any error messages
    clearError();
    
    // Clear results
    clearResults();
    
    // Reset progress
    hideProgress();
    
    // Re-initialize reset buttons
    setupResetButtons();
}

// Initialize reset buttons when the DOM is loaded
// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set up all reset buttons
    setupResetButtons();
    
    // Get the reset button and add click handler
    const resetButton = document.getElementById('resetForm');
    if (resetButton) {
        resetButton.addEventListener('click', resetForm);
        
        // Show the reset button if there are already selected subreddits
        if (selectedSubreddits.size > 0) {
            resetButton.style.display = 'flex';
            document.getElementById('checkDuplicates').disabled = false;
        }
    }
});

document.getElementById('addSubredditBtn').addEventListener('click', () => {
    const subredditInput = document.getElementById('subredditInput');
    const subreddit = subredditInput.value.trim();
    
    // Validate subreddit name
    const subredditRegex = /^[A-Za-z0-9][A-Za-z0-9_]{2,20}$/;
    if (!subredditRegex.test(subreddit)) {
        showError('Invalid subreddit name. Must be 3-21 characters and contain only letters, numbers, and underscores.');
        return;
    }

    if (!selectedSubreddits.has(subreddit)) {
        selectedSubreddits.add(subreddit);
        updateSubredditDisplay();
        subredditInput.value = '';
        document.getElementById('confirmSubreddits').disabled = false;
    }
});

function updateSubredditDisplay() {
    const container = document.getElementById('selectedSubreddits');
    container.innerHTML = '';
    
    selectedSubreddits.forEach(subreddit => {
        const tag = document.createElement('div');
        tag.className = 'subreddit-tag';
        tag.innerHTML = `
            r/${subreddit}
            <button type="button" onclick="removeSubreddit('${subreddit}')">&times;</button>
        `;
        container.appendChild(tag);
    });
}

function removeSubreddit(subreddit) {
    selectedSubreddits.delete(subreddit);
    updateSubredditDisplay();
    document.getElementById('confirmSubreddits').disabled = selectedSubreddits.size === 0;
    document.getElementById('checkDuplicates').disabled = true;
}

// Handle subreddit confirmation
document.getElementById('confirmSubreddits').addEventListener('click', () => {
    if (selectedSubreddits.size > 0) {
        const checkDuplicatesBtn = document.getElementById('checkDuplicates');
        const resetButton = document.getElementById('resetForm');
        
        // Enable the analyze button
        checkDuplicatesBtn.disabled = false;
        
        // Disable subreddit input controls
        document.getElementById('subredditInput').disabled = true;
        document.getElementById('addSubredditBtn').disabled = true;
        document.getElementById('confirmSubreddits').disabled = true;
        
        // Show the reset button
        if (resetButton) {
            resetButton.style.display = 'flex';
            
            // Force a reflow to ensure the display change is applied
            void resetButton.offsetHeight;
            
            // Add a class for any additional styling if needed
            resetButton.classList.add('visible');
        }
    }
});

// Re-initialize reset buttons after form submission
document.getElementById('imageForm').addEventListener('submit', async (e) => {
    // Ensure reset buttons are properly set up
    setupResetButtons();
    e.preventDefault();
    clearError();
    
    const formData = new FormData(e.target);
    const imageUrl = formData.get('image_url');
    const imageFile = formData.get('image');
    
    if (selectedSubreddits.size === 0) {
        showError('Please add and confirm at least one subreddit');
        return;
    }

    // Remove any existing subreddit fields
    formData.delete('subreddit[]');
    
    // Add each selected subreddit to the form data
    selectedSubreddits.forEach(subreddit => {
        formData.append('subreddit[]', subreddit);
    });

    if (!imageUrl && !imageFile.size) {
        showError('Please provide an image file, image URL, or Reddit post URL');
        return;
    }

    const isRedditUrl = imageUrl && isRedditPostUrl(imageUrl);
    const isImageUrl = imageUrl && !isRedditUrl && validateImageUrl(imageUrl);

    if (imageUrl && !isRedditUrl && !isImageUrl) {
        showError('Please provide a valid image URL (.jpg, .jpeg, .png, .gif, .webp) or Reddit post URL');
        return;
    }

    initializeResultsContainer();
    showProgress(isRedditUrl);

    try {
        const response = await fetch('/api/check-duplicates', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to check duplicates');
        }
        
        displayResults(data.results);
    } catch (error) {
        showDetailedError({
            message: error.message || 'An unexpected error occurred',
            details: error.details || ''
        });
        clearResults();
    } finally {
        hideProgress();
    }
});

// File input preview
document.getElementById('imageFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            showPreview(e.target.result);
            document.getElementById('imageUrl').value = ''; // Clear URL input
        }
        reader.readAsDataURL(file);
    } else {
        hidePreview();
    }
});

// URL input preview
document.getElementById('imageUrl').addEventListener('input', function(e) {
    const url = e.target.value.trim();
    if (url && validateImageUrl(url)) {
        showPreview(url);
        document.getElementById('imageFile').value = ''; // Clear file input
    } else {
        hidePreview();
    }
});

// Clear preview button
document.getElementById('clearPreview').addEventListener('click', function(e) {
    e.preventDefault();
    hidePreview();
    document.getElementById('imageFile').value = '';
    document.getElementById('imageUrl').value = '';
});

function validateImageUrl(url) {
    try {
        const urlObj = new URL(url);
        
        // Support for various platforms
        const supportedDomains = [
            'reddit.com', 'i.redd.it', 'preview.redd.it',
            'imgur.com', 'i.imgur.com',
            'gfycat.com',
            'media.discordapp.net', 'cdn.discordapp.com',
            'pbs.twimg.com'
        ];
        
        // Check if URL is from a supported domain
        const isSupported = supportedDomains.some(domain => 
            urlObj.hostname.includes(domain));
            
        if (isSupported) {
            return true;
        }
        
        // For other domains, check if it's a direct image URL
        return url.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null;
    } catch (e) {
        return false;
    }
}

function isRedditPostUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes('reddit.com') && url.includes('/comments/');
    } catch (e) {
        return false;
    }
}

function initializeResultsContainer() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.style.display = 'block';

    const originalPostDiv = document.getElementById('originalPost');
    const duplicatesDiv = document.getElementById('duplicates');
    
    originalPostDiv.innerHTML = '<h2 class="section-title">Original Post</h2>';
    duplicatesDiv.innerHTML = '';
}

function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    const originalPostDiv = document.getElementById('originalPost');
    const duplicatesDiv = document.getElementById('duplicates');
    const duplicatesContainer = document.getElementById('duplicatesContainer');

    resultsDiv.style.display = 'block';

    if (!results || results.length === 0) {
        originalPostDiv.innerHTML += '<p class="no-results">No duplicates found</p>';
        duplicatesContainer.style.display = 'none';
        return;
    }

    // Sort posts by date (oldest first)
    const sortedPosts = results.sort((a, b) => new Date(a.date) - new Date(b.date));
    const originalPost = sortedPosts[0];
    const duplicates = sortedPosts.slice(1);

    // Display original post
    originalPostDiv.appendChild(createPostElement(originalPost, true));

    // Display duplicates
    if (duplicates.length > 0) {
        duplicatesContainer.style.display = 'block';
        duplicates.forEach(post => {
            duplicatesDiv.appendChild(createPostElement(post, false));
        });
    } else {
        duplicatesContainer.style.display = 'none';
    }
}

function createPostElement(post, isOriginal) {
    const template = document.getElementById('postTemplate');
    const element = template.content.cloneNode(true);
    
    const card = element.querySelector('.post-card');
    const image = element.querySelector('.post-image');
    const title = element.querySelector('.post-title');
    const date = element.querySelector('.post-date');
    const author = element.querySelector('.post-author');
    const link = element.querySelector('.post-link');
    const reportButton = element.querySelector('.report-button');
    
    image.src = post.image_url;
    image.alt = post.title;
    title.textContent = post.title;
    date.textContent = new Date(post.date).toLocaleDateString();
    author.textContent = `Posted by u/${post.author}`;
    link.href = post.reddit_url;
    
    if (isOriginal) {
        card.classList.add('original');
    }

    reportButton.addEventListener('click', () => reportPost(post.id));
    
    return element;
}

async function reportPost(postId) {
    // Create the report modal if it doesn't exist
    let modal = document.getElementById('reportModal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reportModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Report this content</h3>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="modal-body">
                    <p>Please select a reason for reporting this content:</p>
                    <div class="report-options">
                        <label><input type="radio" name="reportReason" value="spam"> Spam</label>
                        <label><input type="radio" name="reportReason" value="rules"> Breaks r/CommunityName rules</label>
                        <label><input type="radio" name="reportReason" value="harassment"> Harassment</input>
                        <label><input type="radio" name="reportReason" value="sharing"> Sharing personal information</label>
                        <label><input type="radio" name="reportReason" value="copyright"> Copyright violation</label>
                        <label><input type="radio" name="reportReason" value="other"> Other issues</label>
                    </div>
                    <div class="report-additional" style="display: none; margin-top: 15px;">
                        <label for="reportDetails">Additional details (optional):</label>
                        <textarea id="reportDetails" rows="3" placeholder="Please provide more information about your report"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="button secondary" id="cancelReport">Cancel</button>
                    <button class="button primary" id="submitReport" disabled>Submit Report</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add event listeners for the modal
        document.querySelector('.close-btn').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        document.getElementById('cancelReport').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });

        // Toggle additional details for 'Other issues'
        const reportReasons = document.querySelectorAll('input[name="reportReason"]');
        reportReasons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const additionalDiv = document.querySelector('.report-additional');
                additionalDiv.style.display = e.target.value === 'other' ? 'block' : 'none';
                document.getElementById('submitReport').disabled = false;
            });
        });

        // Handle form submission
        document.getElementById('submitReport').addEventListener('click', async () => {
            const selectedReason = document.querySelector('input[name="reportReason"]:checked');
            const additionalInfo = document.getElementById('reportDetails').value;
            
            if (!selectedReason) {
                alert('Please select a reason for reporting');
                return;
            }

            const submitBtn = document.getElementById('submitReport');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Reporting...';
            submitBtn.classList.add('loading');

            // Show success message directly without API call
            const modalBody = document.querySelector('.modal-body');
            modalBody.innerHTML = `
                <div class="report-success">
                    <svg viewBox="0 0 48 48" width="48" height="48">
                        <path fill="#4CAF50" d="M44,24c0,11.045-8.955,20-20,20S4,35.045,4,24S12.955,4,24,4S44,12.955,44,24z"/>
                        <path fill="#CCFF90" d="M34.6,14.6L21,28.2l-5.6-5.6l-2.8,2.8l8.4,8.4l16.4-16.4L34.6,14.6z"/>
                    </svg>
                    <h3>Reported Successfully</h3>
                    <p>Thank you for your report.</p>
                </div>
            `;
            
            // Hide the footer for the success state
            const modalFooter = document.querySelector('.modal-footer');
            modalFooter.style.display = 'none';
            
            // Close the modal after 1.5 seconds
            setTimeout(() => {
                modal.classList.remove('show');
                // Wait for transition to complete before removing
                setTimeout(() => {
                    modal.style.display = 'none';
                    modal.remove();
                }, 200);
            }, 1500);
            submitBtn.classList.remove('loading');
        });
    }
    
    // Show the modal with transition
    modal.style.display = 'flex';
    // Force reflow
    void modal.offsetWidth;
    // Add show class for transition
    modal.classList.add('show');
}

function validateImageUrl(url) {
    try {
        new URL(url);
        return url.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null;
    } catch (e) {
        return false;
    }
}

function isRedditPostUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes('reddit.com') && url.includes('/comments/');
    } catch (e) {
        return false;
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function showDetailedError(error) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.innerHTML = `
        <strong>${error.message}</strong>
        ${error.details ? `<div class="error-details">${error.details}</div>` : ''}
    `;
    errorDiv.classList.add('detailed');
    errorDiv.style.display = 'block';
}

function clearError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.innerHTML = '';
    errorDiv.classList.remove('detailed');
    errorDiv.style.display = 'none';
}

function clearResults() {
    const resultsDiv = document.getElementById('results');
    const originalPostDiv = document.getElementById('originalPost');
    const duplicatesDiv = document.getElementById('duplicates');
    const duplicatesContainer = document.getElementById('duplicatesContainer');
    
    resultsDiv.style.display = 'none';
    originalPostDiv.innerHTML = '<h2 class="section-title">Original Post</h2>';
    duplicatesDiv.innerHTML = '';
    duplicatesContainer.style.display = 'none';
}

function showProgress(isRedditUrl) {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const progressContainer = document.querySelector('.progress-container');
    const progressBar = document.querySelector('.progress');
    const progressText = document.querySelector('.progress-text');
    const steps = document.querySelectorAll('.step');
    
    loadingSpinner.style.display = 'flex';
    progressContainer.style.display = 'block';
    document.getElementById('results').style.display = 'none';
    
    progressBar.style.width = '0%';
    steps.forEach(step => step.classList.remove('active', 'completed'));
    
    let currentStep = 0;
    updateProgress(currentStep);
    
    progressText.textContent = isRedditUrl ? 'Fetching Reddit post...' : 'Processing image...';
    startProgressAnimation(isRedditUrl);
}

function updateProgress(step) {
    const steps = document.querySelectorAll('.step');
    const progressBar = document.querySelector('.progress');
    const progressText = document.querySelector('.progress-text');
    const texts = [
        'Downloading Image...',
        'Processing...',
        'Searching Reddit...',
        'Analyzing Results...'
    ];
    
    const progress = (step / (steps.length - 1)) * 100;
    progressBar.style.width = `${progress}%`;
    
    steps.forEach((stepEl, index) => {
        if (index < step) {
            stepEl.classList.add('completed');
            stepEl.classList.remove('active');
        } else if (index === step) {
            stepEl.classList.add('active');
            stepEl.classList.remove('completed');
        } else {
            stepEl.classList.remove('active', 'completed');
        }
    });
    
    progressText.textContent = texts[step];
}

function startProgressAnimation(isRedditUrl) {
    let step = 0;
    const steps = document.querySelectorAll('.step');
    const totalSteps = steps.length;
    const baseDelay = isRedditUrl ? 2000 : 1000;
    
    function nextStep() {
        if (step < totalSteps) {
            updateProgress(step);
            step++;
            setTimeout(nextStep, baseDelay);
        }
    }
    
    nextStep();
}

function hideProgress() {
    document.getElementById('loadingSpinner').style.display = 'none';
    document.querySelector('.progress-container').style.display = 'none';
}

// Image preview functionality
function showPreview(src) {
    const previewContainer = document.getElementById('imagePreview');
    const previewImage = document.getElementById('previewImage');
    previewImage.src = src;
    previewContainer.style.display = 'block';
}

function hidePreview() {
    const previewContainer = document.getElementById('imagePreview');
    const previewImage = document.getElementById('previewImage');
    previewImage.src = '';
    previewContainer.style.display = 'none';
}

// File input preview
document.getElementById('imageFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            showPreview(e.target.result);
            document.getElementById('imageUrl').value = '';
        }
        reader.readAsDataURL(file);
    } else {
        hidePreview();
    }
});

// URL input preview
document.getElementById('imageUrl').addEventListener('input', function(e) {
    const url = e.target.value.trim();
    if (url && validateImageUrl(url)) {
        showPreview(url);
        document.getElementById('imageFile').value = '';
    } else {
        hidePreview();
    }
});