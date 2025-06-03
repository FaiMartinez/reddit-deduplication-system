// Store selected subreddits
let selectedSubreddits = new Set();

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

document.getElementById('confirmSubreddits').addEventListener('click', () => {
    if (selectedSubreddits.size > 0) {
        document.getElementById('checkDuplicates').disabled = false;
        document.getElementById('subredditInput').disabled = true;
        document.getElementById('addSubredditBtn').disabled = true;
        document.getElementById('confirmSubreddits').disabled = true;
    }
});

document.getElementById('imageForm').addEventListener('submit', async (e) => {
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

    if (!imageUrl && !imageFile) {
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
        
        displayResults(data.results);    } catch (error) {
        const errorMessage = error.message || 'An unexpected error occurred';
        const errorDetails = error.details || '';
        showDetailedError(errorMessage, errorDetails);
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

function initializeResultsContainer() {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) return;

    // Ensure container structure exists
    if (!document.getElementById('originalPost')) {
        const originalDiv = document.createElement('div');
        originalDiv.id = 'originalPost';
        originalDiv.className = 'original-post-container';
        resultsDiv.appendChild(originalDiv);
    }

    if (!document.getElementById('duplicatesContainer')) {
        const duplicatesContainer = document.createElement('div');
        duplicatesContainer.id = 'duplicatesContainer';
        
        const header = document.createElement('h3');
        header.className = 'duplicates-header';
        header.style.display = 'none';
        header.textContent = 'Duplicate Posts';
        duplicatesContainer.appendChild(header);

        const duplicatesDiv = document.createElement('div');
        duplicatesDiv.id = 'duplicates';
        duplicatesDiv.className = 'duplicates-list';
        duplicatesContainer.appendChild(duplicatesDiv);

        resultsDiv.appendChild(duplicatesContainer);
    }
}

function displayResults(results) {
    try {
        // Check for all required DOM elements first
        const requiredElements = {
            resultsSection: document.getElementById('results'),
            originalPostDiv: document.getElementById('originalPost'),
            duplicatesDiv: document.getElementById('duplicates'),
            duplicatesContainer: document.getElementById('duplicatesContainer'),
            template: document.getElementById('postTemplate')
        };

        // Check if any required elements are missing
        const missingElements = Object.entries(requiredElements)
            .filter(([_, element]) => !element)
            .map(([name]) => name);

        if (missingElements.length > 0) {
            throw new Error('Missing required DOM elements: ' + missingElements.join(', '));
        }

        // Show the results section
        requiredElements.resultsSection.style.display = 'block';

        // Clear previous results with error handling
        try {
            requiredElements.originalPostDiv.innerHTML = '<h2 class="section-title">Original Post</h2>';
            requiredElements.duplicatesDiv.innerHTML = '';
        } catch (clearError) {
            console.error('Error clearing previous results:', clearError);
            throw new Error('Failed to clear previous results');
        }

        // Handle empty or invalid results
        if (!results || !Array.isArray(results) || results.length === 0) {
            requiredElements.originalPostDiv.innerHTML += '<p class="no-results">No duplicates found</p>';
            return;
        }

        try {
            // Sort by date and get original post
            const sortedPosts = results.sort((a, b) => new Date(a.date) - new Date(b.date));
            const originalPost = sortedPosts[0];
            const duplicates = sortedPosts.slice(1);

            // Display original post
            requiredElements.originalPostDiv.appendChild(createPostElement(originalPost, true));

            // Show/hide duplicates header based on whether there are duplicates
            const duplicatesHeader = requiredElements.duplicatesContainer.querySelector('.duplicates-header');
            if (duplicatesHeader) {
                duplicatesHeader.style.display = duplicates.length > 0 ? 'block' : 'none';
            }

            // Display duplicates if any
            requiredElements.duplicatesDiv.innerHTML = duplicates.length > 0 ? '' : '<p class="no-results">No duplicates found</p>';
            duplicates.forEach(post => {
                requiredElements.duplicatesDiv.appendChild(createPostElement(post, false));
            });
        } catch (displayError) {
            console.error('Error displaying results:', displayError);
            throw new Error('Failed to display results: ' + displayError.message);
        }
    } catch (error) {
        showDetailedError({
            message: 'Error displaying results',
            details: error.message
        });
        clearResults();
    }
}

function createPostElement(post, isOriginal) {
    const template = document.getElementById('postTemplate');
    const element = template.content.cloneNode(true);
    
    element.querySelector('.post-image').src = post.image_url;
    element.querySelector('.post-title').textContent = post.title;
    element.querySelector('.post-date').textContent = new Date(post.date).toLocaleDateString();
    element.querySelector('.post-author').textContent = `Posted by u/${post.author}`;
    element.querySelector('.post-link').href = post.reddit_url;
    
    const card = element.querySelector('.post-card');
    if (isOriginal) {
        card.classList.add('original');
    }

    const reportButton = element.querySelector('.report-button');
    reportButton.addEventListener('click', () => reportPost(post.id));
    
    return element;
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function clearError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.innerHTML = '';
    errorDiv.classList.remove('detailed');
    errorDiv.style.display = 'none';
}

async function reportPost(postId) {
    try {
        const response = await fetch('/api/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `post_id=${postId}`
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to report post');
        }
        
        alert('Post reported successfully');
    } catch (error) {
        showError(error.message);
    }
}

function clearResults() {
    const resultsSection = document.getElementById('results');
    const originalPostDiv = document.getElementById('originalPost');
    const duplicatesDiv = document.getElementById('duplicates');
    
    if (resultsSection) {
        resultsSection.style.display = 'none';
    }
    if (originalPostDiv) {
        originalPostDiv.innerHTML = '<h2 class="section-title">Original Post</h2>';
    }
    if (duplicatesDiv) {
        duplicatesDiv.innerHTML = '';
    }
}

function showProgress(isRedditUrl) {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const progressContainer = document.querySelector('.progress-container');
    const progressBar = document.querySelector('.progress');
    const progressText = document.querySelector('.progress-text');
    const steps = document.querySelectorAll('.step');
    
    // Show progress elements
    loadingSpinner.style.display = 'flex';
    progressContainer.style.display = 'block';
    document.getElementById('results').style.display = 'none';
    
    // Reset progress
    progressBar.style.width = '0%';
    steps.forEach(step => step.classList.remove('active', 'completed'));
    
    // Set initial step
    let currentStep = 0;
    updateProgress(currentStep);
    
    if (isRedditUrl) {
        progressText.textContent = 'Fetching Reddit post...';
    } else {
        progressText.textContent = 'Processing image...';
    }
    
    // Start progress animation
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
    
    // Update progress bar
    const progress = (step / (steps.length - 1)) * 100;
    progressBar.style.width = `${progress}%`;
    
    // Update step indicators
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
    
    // Update progress text
    progressText.textContent = texts[step];
}

function startProgressAnimation(isRedditUrl) {
    let step = 0;
    const steps = document.querySelectorAll('.step');
    const totalSteps = steps.length;
    const baseDelay = isRedditUrl ? 2000 : 1000; // Longer delay for Reddit URLs
    
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
    document.getElementById('results').style.display = 'block';
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
