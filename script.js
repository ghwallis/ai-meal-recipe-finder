const SPOONACULAR_API_KEY = 'your-spoonacular-api-key';
const GOOGLE_VISION_API_KEY = 'your-google-vision-api-key';

const CACHED_RECIPES = {
  "jollof rice": [
    {
      id: 1,
      title: "Traditional Jollof Rice",
      image: "https://example.com/jollof.jpg",
      readyInMinutes: 60,
      servings: 6,
      instructions: "1. Heat oil in a large pot...",
      ingredients: ["rice", "tomatoes", "onions", "spices"]
    }
    // Add more popular recipes
  ],
  // Add more meal categories
};

// Add this comprehensive recipe database
const RECIPE_DATABASE = {
  african: {
    "jollof rice": {
      title: "Traditional Jollof Rice",
      cuisine: "West African",
      readyInMinutes: 60,
      servings: 6,
      ingredients: [
        "2 cups long grain rice",
        "400g tomato puree",
        "2 red bell peppers",
        "2 medium onions",
        "3 cloves garlic",
        "2 tbsp curry powder",
        "1 tbsp thyme",
        "2 bay leaves",
        "Scotch bonnet pepper (to taste)",
        "Stock cubes",
        "Salt to taste"
      ],
      instructions: [
        "Blend tomatoes, red bell peppers, and onions until smooth",
        "Heat oil in a large pot and sauté onions",
        "Add blended mixture and cook until reduced",
        "Add spices and seasonings",
        "Add washed rice and stock",
        "Cook until rice is done and liquid is absorbed"
      ],
      image: "https://example.com/jollof.jpg",
      tips: "For the best results, use long grain rice and parboil before adding to the sauce."
    },
    // Add more African recipes
  },
  asian: {
    // Asian recipes
  },
  european: {
    // European recipes
  }
  // Add more cuisines
};

// Add rate limiting utility
const RateLimiter = {
  calls: {},
  limit: 150, // Daily limit
  resetTime: 24 * 60 * 60 * 1000, // 24 hours in milliseconds

  async checkLimit() {
    const today = new Date().toDateString();
    this.calls[today] = this.calls[today] || 0;

    if (this.calls[today] >= this.limit) {
      throw new Error('API limit reached');
    }

    this.calls[today]++;
    localStorage.setItem('apiCalls', JSON.stringify(this.calls));
  },

  init() {
    const saved = localStorage.getItem('apiCalls');
    if (saved) {
      this.calls = JSON.parse(saved);
    }
  }
};

// Initialize rate limiter
RateLimiter.init();

// Add function to search local database
function searchLocalDatabase(searchTerm) {
  const normalizedSearch = searchTerm.toLowerCase().trim();
  let results = [];

  // Search through all cuisines
  for (const cuisine of Object.values(RECIPE_DATABASE)) {
    for (const [name, recipe] of Object.entries(cuisine)) {
      if (name.includes(normalizedSearch) || normalizedSearch.includes(name)) {
        results.push({
          ...recipe,
          id: name.replace(/\s+/g, '-'),
          title: recipe.title || name
        });
      }
    }
  }

  return results;
}

let map;
let markers = [];
let infoWindow;

// Initialize AWS SDK
AWS.config.update({
  region: ENV.AWS_REGION,
  credentials: new AWS.Credentials({
    accessKeyId: ENV.AWS_ACCESS_KEY_ID,
    secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY
  })
});

// Initialize DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Test AWS connection on page load
document.addEventListener('DOMContentLoaded', () => {
  console.log('Page loaded, testing AWS connection...');
  testAWSConnection();
  initTipsCarousel();
});

// Add error handling utility
const handleAWSError = (error, fallbackData = null) => {
    console.error('AWS Error:', error);
    // Check if it's a credentials error
    if (error.code === 'CredentialsError' || error.code === 'UnauthorizedException') {
        console.log('Falling back to local storage due to AWS credentials error');
        return useLocalStorage();
    }
    return fallbackData;
};

// Local storage fallback
const useLocalStorage = () => {
    return {
        async get(key) {
            try {
                const data = localStorage.getItem(`recipe_${key}`);
                return data ? JSON.parse(data) : null;
            } catch (error) {
                console.error('LocalStorage Error:', error);
                return null;
            }
        },
        async set(key, value) {
            try {
                localStorage.setItem(`recipe_${key}`, JSON.stringify(value));
                return true;
            } catch (error) {
                console.error('LocalStorage Error:', error);
                return false;
            }
        }
    };
};

// Updated caching functions with better error handling
async function cacheRecipe(recipe) {
    if (!recipe || !recipe.id) return false;
    
    try {
        const item = {
            TableName: 'recipes-cache',
            Item: {
                id: recipe.id.toString(),
                data: recipe,
                timestamp: Date.now(),
                ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hour TTL
            }
        };

        await dynamoDB.put(item).promise();
        // Also cache locally as backup
        await useLocalStorage().set(recipe.id.toString(), recipe);
        return true;
    } catch (error) {
        return handleAWSError(error, false);
    }
}

async function getRecipeFromCache(recipeId) {
    if (!recipeId) return null;
    
    try {
        const params = {
            TableName: 'recipes-cache',
            Key: { id: recipeId.toString() }
        };

        const result = await dynamoDB.get(params).promise();
        
        if (result.Item && result.Item.ttl > Math.floor(Date.now() / 1000)) {
            console.log('Cache hit from DynamoDB!');
            return result.Item.data;
        }

        // Try local storage if DynamoDB fails or item not found
        const localData = await useLocalStorage().get(recipeId.toString());
        if (localData) {
            console.log('Cache hit from localStorage!');
            return localData;
        }

        return null;
    } catch (error) {
        return handleAWSError(error, null);
    }
}

// Update searchMealByText function with better error handling
async function searchMealByText() {
    console.log('searchMealByText called');
    const mealInput = document.getElementById('mealNameInput').value.trim();
    const recipeResults = document.getElementById('recipeResults');
    
    if (!mealInput) {
        console.log('No meal input provided');
        showError('Please enter a meal name!');
        return;
    }
    
    console.log('Searching for:', mealInput);
    recipeResults.innerHTML = '<div class="loading">Searching for recipes...</div>';
    
    try {
        // Check cache first
        const cachedResult = await getRecipeFromCache(mealInput.toLowerCase());
        
        if (cachedResult) {
            console.log('Cache hit:', cachedResult);
            displayDetailedRecipes([cachedResult], mealInput, false, false);
            return;
        }

        // If not in cache, try API
        let recipes = [];
        try {
            recipes = await tryMultipleSearchStrategies(mealInput);
            // Cache successful results
            if (recipes.length > 0) {
                console.log('Caching recipes:', recipes);
                await Promise.all(recipes.map(recipe => cacheRecipe(recipe)));
            }
        } catch (apiError) {
            console.log('API error, using fallback data:', apiError);
            recipes = getFallbackRecipes(mealInput);
        }
        
        if (!recipes || recipes.length === 0) {
            console.log('No recipes found, searching web');
            const webResults = await searchWebForRecipe(mealInput);
            displayWebRecipeResults(mealInput, webResults);
        } else {
            console.log('Displaying recipes:', recipes);
            displayDetailedRecipes(recipes, mealInput, false, false);
        }
    } catch (error) {
        console.error('Search error:', error);
        displayWebRecipeResults(mealInput, getCuratedRecipeSources(mealInput));
    }
}

document.getElementById('identifyMealButton').addEventListener('click', async () => {
  console.log('Identify meal button clicked');
  const fileInput = document.getElementById('mealImageInput');
  const file = fileInput.files[0];
  console.log('File selected:', file);
  const recipeResults = document.getElementById('recipeResults');

  if (!file) {
    showError('Please upload an image!');
    return;
  }

  if (!file.type.startsWith('image/')) {
    showError('Please upload a valid image file!');
    return;
  }

  recipeResults.innerHTML = '<div class="loading">Analyzing image...</div>';

  try {
    const imageData = await readFileAsBase64(file);
    console.log('Image converted to base64');

    const apiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`;
    
    const requestBody = {
      requests: [{
        image: {
          content: imageData
        },
        features: [{
          type: 'LABEL_DETECTION',
          maxResults: 15
        }, {
          type: 'WEB_DETECTION',
          maxResults: 10
        }]
      }]
    };

    console.log('Sending request to Google Vision API...');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error:', errorData);
      throw new Error(errorData.error?.message || 'Failed to analyze image');
    }

    const data = await response.json();
    console.log('Vision API response:', data);

    if (!data.responses || !data.responses[0]) {
      throw new Error('Invalid response from Vision API');
    }

    const response0 = data.responses[0];
    const labels = response0.labelAnnotations || [];
    const webDetection = response0.webDetection || {};
    console.log('Detected labels:', labels);
    console.log('Web detection:', webDetection);

    const allDetections = [
      ...(labels.map(l => ({ 
        description: l.description,
        score: l.score,
        source: 'label'
      }))),
      ...(webDetection.webEntities || []).map(e => ({
        description: e.description,
        score: e.score,
        source: 'web'
      }))
    ];

    const foodTerms = [
      'food', 'dish', 'cuisine', 'meal', 'recipe', 'breakfast', 'lunch', 
      'dinner', 'snack', 'dessert', 'appetizer', 'soup', 'salad', 'sandwich',
      'pasta', 'meat', 'vegetable', 'fruit'
    ];

    const foodLabels = allDetections.filter(detection => {
      const desc = detection.description.toLowerCase();
      return foodTerms.some(term => desc.includes(term)) ||
             !(desc.includes('restaurant') || desc.includes('table') || 
               desc.includes('plate') || desc.includes('drink'));
    });

    foodLabels.sort((a, b) => (b.score || 0) - (a.score || 0));

    if (foodLabels.length > 0) {
      const bestMatch = foodLabels[0];
      const otherMatches = foodLabels
        .slice(1, 4)
        .filter(label => label.description.toLowerCase() !== bestMatch.description.toLowerCase());

      recipeResults.innerHTML = `
        <div class="identified-meal">
          <h3>Identified Food:</h3>
          <p class="primary-match">${bestMatch.description} 
            ${bestMatch.score ? `(${Math.round(bestMatch.score * 100)}% confidence)` : ''}
          </p>
          ${otherMatches.length > 0 ? `
            <div class="other-matches">
              <p>Other possible matches:</p>
              <ul>
                ${otherMatches.map(match => `
                  <li>${match.description}
                    ${match.score ? ` (${Math.round(match.score * 100)}%)` : ''}
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      `;
      
      await searchRecipesByMealName(bestMatch.description);
    } else {
      recipeResults.innerHTML = `
        <div class="error">
          <p>No food items detected in the image. Try a different photo.</p>
          <p>Detected items: ${labels.slice(0, 3).map(l => l.description).join(', ')}</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error in image analysis:', error);
    showError(`Error analyzing image: ${error.message}`);
  }
});

function showError(message) {
  const recipeResults = document.getElementById('recipeResults');
  recipeResults.innerHTML = `<div class="error">${message}</div>`;
}

function displayRecipes(recipes) {
  const recipeResults = document.getElementById('recipeResults');
  recipeResults.innerHTML = '';

  recipes.forEach(recipe => {
    const recipeElement = document.createElement('div');
    recipeElement.className = 'recipe-card';
    recipeElement.innerHTML = `
      <h4>${recipe.title}</h4>
      <img src="${recipe.image}" alt="${recipe.title}">
      <p>Missing ingredients: ${recipe.missedIngredientCount}</p>
      <button onclick="getRecipeDetails(${recipe.id})">View Full Recipe</button>
    `;
    recipeResults.appendChild(recipeElement);
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

const CUISINE_KEYWORDS = {
  indian: ['curry', 'masala', 'tikka', 'biryani', 'dal', 'paneer', 'naan'],
  chinese: ['stir fry', 'dumpling', 'noodle', 'fried rice', 'wonton', 'dim sum'],
  japanese: ['sushi', 'ramen', 'udon', 'tempura', 'teriyaki', 'miso'],
  mexican: ['taco', 'burrito', 'enchilada', 'quesadilla', 'salsa', 'guacamole'],
  thai: ['pad thai', 'curry', 'tom yum', 'satay'],
  italian: ['pasta', 'pizza', 'risotto', 'lasagna', 'gnocchi'],
  mediterranean: ['hummus', 'falafel', 'kebab', 'shawarma', 'pita'],
  'west african': [
    'jollof', 'fufu', 'pounded yam', 'egusi', 'suya', 'waakye', 'kenkey',
    'banku', 'attieke', 'garri', 'chin chin', 'puff puff', 'akara',
    'moimoi', 'ogbono', 'okra soup', 'kontomire', 'kelewele', 'shito',
    'eba', 'amala', 'plantain'
  ],
  'east african': [
    'ugali', 'injera', 'wat', 'tibs', 'kitfo', 'doro wat', 'berbere',
    'sukuma wiki', 'pilau', 'matoke', 'mandazi', 'chapati', 'mukimo',
    'nyama choma', 'kachumbari', 'sambusa', 'mutura', 'irio'
  ],
  'north african': [
    'couscous', 'tagine', 'harissa', 'shakshuka', 'ful medames',
    'duqqa', 'chermoula', 'pastilla', 'merguez', 'msemen',
    'bissara', 'zaalouk', 'rfissa', 'harira', 'brik', 'shakshouka'
  ],
  'southern african': [
    'pap', 'bobotie', 'boerewors', 'biltong', 'chakalaka', 'sadza',
    'mealie', 'potjiekos', 'vetkoek', 'malva pudding', 'koesisters',
    'sosaties', 'umngqusho', 'morogo', 'amadumbe', 'samp'
  ],
  'central african': [
    'fufu', 'ndole', 'mbanga soup', 'eru', 'koki', 'saka saka',
    'mshikaki', 'muamba', 'moambe', 'fumbwa', 'pondu', 'maboke',
    'makayabu', 'liboke', 'kwanga'
  ],
  'african': [
    'stew', 'pepper soup', 'groundnut', 'cassava', 'yam', 'plantain',
    'palm oil', 'african soup', 'african stew', 'african curry',
    'african sauce', 'african rice', 'african beans'
  ]
};

function detectCuisineType(description) {
  const lowerDesc = description.toLowerCase();
  let matches = [];

  for (const [cuisine, keywords] of Object.entries(CUISINE_KEYWORDS)) {
    if (keywords.some(keyword => lowerDesc.includes(keyword))) {
      matches.push(cuisine);
    }
  }

  if (matches.length > 0) {
    if (matches.includes('african') && matches.length > 1) {
      matches = matches.filter(m => m !== 'african');
    }
    return matches[0];
  }

  return null;
}

async function searchWebForRecipe(mealName) {
  try {
    const results = getCuratedRecipeSources(mealName);
    
    if (isAfricanDish(mealName)) {
      results.items = [
        ...getAfricanRecipeSources(mealName),
        ...results.items
      ];
    }
    
    return results;
  } catch (error) {
    console.error('Web search error:', error);
    return getCuratedRecipeSources(mealName);
  }
}

function isAfricanDish(mealName) {
  const africanKeywords = [
    'jollof', 'fufu', 'egusi', 'suya', 'waakye', 'kenkey',
    'banku', 'attieke', 'pounded yam', 'chin chin', 'puff puff',
    'akara', 'moimoi', 'ogbono', 'okra soup', 'kontomire'
  ];
  
  return africanKeywords.some(keyword => 
    mealName.toLowerCase().includes(keyword.toLowerCase())
  );
}

function getAfricanRecipeSources(mealName) {
  const africanRecipeSites = [
    {
      name: 'African Bites',
      domain: 'africanbites.com',
      searchUrl: `https://www.africanbites.com/?s=${encodeURIComponent(mealName)}`
    },
    {
      name: 'All Nigerian Recipes',
      domain: 'allnigerianrecipes.com',
      searchUrl: `https://www.allnigerianrecipes.com/search?q=${encodeURIComponent(mealName)}`
    },
    {
      name: '9ja Foodie',
      domain: '9jafoodie.com',
      searchUrl: `https://9jafoodie.com/?s=${encodeURIComponent(mealName)}`
    },
    {
      name: 'My Active Kitchen',
      domain: 'myactivekitchen.com',
      searchUrl: `https://myactivekitchen.com/?s=${encodeURIComponent(mealName)}`
    },
    {
      name: 'Demand Africa',
      domain: 'demandafrica.com',
      searchUrl: `https://www.demandafrica.com/food/recipes/search?q=${encodeURIComponent(mealName)}`
    }
  ];

  return africanRecipeSites.map(site => ({
    title: `${mealName} Recipe - ${site.name}`,
    link: site.searchUrl,
    snippet: `Find authentic ${mealName} recipe and cooking instructions on ${site.name}, specializing in African cuisine.`,
    source: site.domain,
    isAfricanSource: true
  }));
}

function getCuratedRecipeSources(mealName) {
  const generalRecipeSites = [
    {
      name: 'Tasty African Food',
      domain: 'tastyafricanfood.com',
      searchUrl: `https://tastyafricanfood.com/?s=${encodeURIComponent(mealName)}`
    },
    {
      name: 'All Recipes',
      domain: 'allrecipes.com',
      searchUrl: `https://www.allrecipes.com/search?q=${encodeURIComponent(mealName)}`
    },
    {
      name: 'Food Network',
      domain: 'foodnetwork.com',
      searchUrl: `https://www.foodnetwork.com/search/${encodeURIComponent(mealName)}-`
    },
    {
      name: 'BBC Good Food',
      domain: 'bbcgoodfood.com',
      searchUrl: `https://www.bbcgoodfood.com/search?q=${encodeURIComponent(mealName)}`
    }
  ];

  return {
    items: generalRecipeSites.map(site => ({
      title: `${mealName} Recipe - ${site.name}`,
      link: site.searchUrl,
      snippet: `Discover how to make ${mealName} with step-by-step instructions on ${site.name}.`,
      source: site.domain
    }))
  };
}

function displayWebRecipeResults(searchTerm, results) {
  const recipeResults = document.getElementById('recipeResults');
  
  if (!results || !results.items) {
    recipeResults.innerHTML = `
      <div class="web-results-container">
        <div class="search-header">
          <h3>No Results Found</h3>
          <p class="source-note">We couldn't find any recipes for "${searchTerm}" at the moment.</p>
        </div>
        <div class="additional-resources">
          <h4>Try These Resources Instead</h4>
          <ul class="resource-links">
            <li>
              <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm + ' recipe authentic')}" 
                 target="_blank">
                <i class="fab fa-youtube"></i> Watch Video Tutorials
              </a>
            </li>
            <li>
              <a href="https://www.pinterest.com/search/pins/?q=${encodeURIComponent(searchTerm + ' recipe traditional')}" 
                 target="_blank">
                <i class="fab fa-pinterest"></i> Find on Pinterest
              </a>
            </li>
          </ul>
        </div>
      </div>
    `;
    return;
  }

  const africanSources = results.items.filter(item => item.isAfricanSource);
  const generalSources = results.items.filter(item => !item.isAfricanSource);
  
  recipeResults.innerHTML = `
    <div class="web-results-container">
      <div class="search-header">
        <h3>Recipe Results for "${searchTerm}"</h3>
        <p class="source-note">Recipes from trusted cooking websites</p>
      </div>
      
      ${africanSources.length > 0 ? `
        <div class="recipe-section">
          <h4 class="section-title">Authentic African Recipes</h4>
          <div class="web-results-grid">
            ${africanSources.map(result => createRecipeCard(result)).join('')}
          </div>
        </div>
      ` : ''}

      <div class="recipe-section">
        <h4 class="section-title">${africanSources.length > 0 ? 'Additional Recipe Sources' : 'Recipe Sources'}</h4>
        <div class="web-results-grid">
          ${generalSources.map(result => createRecipeCard(result)).join('')}
        </div>
      </div>

      <div class="additional-resources">
        <h4>Video Tutorials & More</h4>
        <ul class="resource-links">
          <li>
            <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm + ' recipe authentic')}" 
               target="_blank">
              <i class="fab fa-youtube"></i> Watch Video Tutorials
            </a>
          </li>
          <li>
            <a href="https://www.pinterest.com/search/pins/?q=${encodeURIComponent(searchTerm + ' recipe traditional')}" 
               target="_blank">
              <i class="fab fa-pinterest"></i> Find on Pinterest
            </a>
          </li>
        </ul>
      </div>
    </div>
  `;
}

function createRecipeCard(result) {
  return `
    <div class="web-recipe-card">
      <div class="web-recipe-content">
        <h4>${result.title}</h4>
        <p>${result.snippet}</p>
        <div class="recipe-source">
          <img src="https://www.google.com/s2/favicons?domain=${result.source}" alt="source icon">
          <span>${result.source}</span>
        </div>
        <a href="${result.link}" target="_blank" class="view-recipe-btn">
          View Full Recipe <i class="fas fa-external-link-alt"></i>
        </a>
      </div>
    </div>
  `;
}

async function searchRecipesByMealName(mealName) {
  const recipeResults = document.getElementById('recipeResults');
  const identifiedMealSection = recipeResults.querySelector('.identified-meal');
  
  try {
    recipeResults.innerHTML = `
      ${identifiedMealSection.outerHTML}
      <div class="loading">Finding recipes and preparation steps...</div>
    `;

    const cuisineType = detectCuisineType(mealName);
    console.log('Detected cuisine:', cuisineType);

    let recipes = await tryMultipleSearchStrategies(mealName, cuisineType);
    let areAlternativeRecipes = false;

    if (recipes.length === 0) {
      recipes = await findSimilarRecipes(mealName, cuisineType);
      areAlternativeRecipes = true;
    }

    if (recipes.length > 0) {
      displayDetailedRecipes(recipes, mealName, areAlternativeRecipes);
    } else {
      const webResults = await searchWebForRecipe(mealName);
      
      if (webResults) {
        recipeResults.innerHTML = `
          ${identifiedMealSection.outerHTML}
          ${webResults}
        `;
      } else {
        recipeResults.innerHTML = `
          ${identifiedMealSection.outerHTML}
          <div class="error">
            <p>We couldn't find detailed recipes for "${mealName}" in our database.</p>
            <p>Try searching online using these terms:</p>
            <ul class="search-suggestions">
              <li>"How to make ${mealName}"</li>
              <li>"${mealName} recipe"</li>
              <li>"Traditional ${mealName}"</li>
              ${cuisineType ? `<li>"${cuisineType} ${mealName}"</li>` : ''}
            </ul>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error('Recipe search error:', error);
    showError(`Failed to fetch recipes: ${error.message}`);
  }
}

async function tryMultipleSearchStrategies(mealName, cuisineType) {
  let params = new URLSearchParams({
    apiKey: SPOONACULAR_API_KEY,
    query: mealName,
    number: '3',
    addRecipeInformation: 'true',
    instructionsRequired: 'true',
    fillIngredients: 'true'
  });

  if (cuisineType) {
    params.append('cuisine', cuisineType);
  }

  let response = await fetch(`https://api.spoonacular.com/recipes/complexSearch?${params}`);
  let data = await response.json();

  if (data.results.length > 0) {
    return data.results;
  }

  params.delete('cuisine');
  response = await fetch(`https://api.spoonacular.com/recipes/complexSearch?${params}`);
  data = await response.json();

  if (data.results.length > 0) {
    return data.results;
  }

  const alternativeTerms = generateAlternativeTerms(mealName);
  for (const term of alternativeTerms) {
    params.set('query', term);
    response = await fetch(`https://api.spoonacular.com/recipes/complexSearch?${params}`);
    data = await response.json();
    
    if (data.results.length > 0) {
      return data.results;
    }
  }

  return [];
}

async function findSimilarRecipes(mealName, cuisineType) {
  let searchTerm;
  
  if (cuisineType && cuisineType.includes('african')) {
    const region = cuisineType.split(' ')[0];
    searchTerm = `${region} african ${getGeneralCategory(mealName)}`;
  } else {
    searchTerm = cuisineType ? 
      `popular ${cuisineType} dishes` : 
      getGeneralCategory(mealName);
  }

  const params = new URLSearchParams({
    apiKey: SPOONACULAR_API_KEY,
    query: searchTerm,
    number: '3',
    addRecipeInformation: 'true',
    instructionsRequired: 'true',
    fillIngredients: 'true'
  });

  const response = await fetch(`https://api.spoonacular.com/recipes/complexSearch?${params}`);
  const data = await response.json();
  return data.results;
}

function generateAlternativeTerms(mealName) {
  const terms = [mealName];
  
  terms.push(mealName.replace(/(recipe|authentic|traditional|homemade)/gi, '').trim());
  
  terms.push(`how to make ${mealName}`);
  
  const words = mealName.split(' ');
  if (words.length > 2) {
    terms.push(`${words[0]} ${words[1]}`);
  }

  return [...new Set(terms)];
}

function getGeneralCategory(mealName) {
  const lowerName = mealName.toLowerCase();
  
  const categories = {
    'stew': ['stew', 'soup', 'sauce', 'wat', 'moambe'],
    'rice dish': ['rice', 'jollof', 'waakye', 'pilau'],
    'porridge': ['fufu', 'ugali', 'pap', 'sadza', 'banku', 'kenkey', 'eba', 'amala'],
    'flatbread': ['injera', 'chapati', 'msemen'],
    'dumpling': ['moimoi', 'tamales', 'kenkey'],
    'grilled': ['suya', 'nyama choma', 'mshikaki'],
    'vegetable dish': ['sukuma wiki', 'morogo', 'kontomire', 'eru'],
    'snack': ['chin chin', 'puff puff', 'mandazi', 'koesisters'],
    'seafood': ['fish', 'seafood', 'makayabu'],
    'meat dish': ['chicken', 'beef', 'goat', 'lamb', 'tibs', 'kitfo']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => lowerName.includes(keyword))) {
      return category;
    }
  }

  return 'main dish';
}

async function getRecipeDetails(recipeId) {
  try {
    const apiUrl = `https://api.spoonacular.com/recipes/${recipeId}/information?apiKey=${SPOONACULAR_API_KEY}`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error('Failed to fetch recipe details');
    
    const recipe = await response.json();
    displayRecipeDetails(recipe);
  } catch (error) {
    showError(`Failed to fetch recipe details: ${error.message}`);
  }
}

function displayRecipeDetails(recipe) {
  const recipeResults = document.getElementById('recipeResults');
  recipeResults.innerHTML = `
    <div class="recipe-details">
      <h3>${recipe.title}</h3>
      <img src="${recipe.image}" alt="${recipe.title}">
      <div class="recipe-info">
        <p>Ready in: ${recipe.readyInMinutes} minutes</p>
        <p>Servings: ${recipe.servings}</p>
      </div>
      <h4>Ingredients:</h4>
      <ul>
        ${recipe.extendedIngredients.map(ing => `<li>${ing.original}</li>`).join('')}
      </ul>
      <h4>Instructions:</h4>
      ${recipe.instructions || 'No instructions available.'}
      <p><a href="${recipe.sourceUrl}" target="_blank">View Original Recipe</a></p>
    </div>
  `;
}

function displayDetailedRecipes(recipes, originalMealName, areAlternative, isFromImage = false) {
  const recipeResults = document.getElementById('recipeResults');
  const identifiedMealSection = isFromImage ? recipeResults.querySelector('.identified-meal')?.outerHTML : '';
  
  recipeResults.querySelector('.loading')?.remove();
  
  const recipesHTML = `
    <div class="recipes-section ${areAlternative ? 'alternative-recipes' : ''}">
      ${areAlternative ? `
        <div class="alternative-notice">
          <i class="fas fa-info-circle"></i>
          <p>We couldn't find exact recipes for "${originalMealName}", but here are some similar dishes you might like:</p>
        </div>
      ` : `
        <h3>Recipes for ${originalMealName}</h3>
      `}
      
      <div class="recipes-grid">
        ${recipes.map(recipe => `
          <div class="recipe-card collapsed" data-recipe-id="${recipe.id}">
            <div class="recipe-header">
              <h3>${recipe.title}</h3>
              ${areAlternative ? `
                <div class="similarity-note">
                  <i class="fas fa-random"></i> Alternative Recipe
                </div>
              ` : ''}
              <div class="recipe-meta">
                <span><i class="far fa-clock"></i> ${recipe.readyInMinutes} mins</span>
                <span><i class="fas fa-user-friends"></i> ${recipe.servings} servings</span>
              </div>
            </div>
            
            <img src="${recipe.image}" alt="${recipe.title}" class="recipe-image">
            
            <div class="recipe-preview">
              <button class="view-details-btn" onclick="toggleRecipeDetails(${recipe.id})">
                View Full Recipe <i class="fas fa-chevron-down"></i>
              </button>
            </div>

            <div class="recipe-full-content" style="display: none;">
              <!-- Full content will be loaded here -->
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  recipeResults.innerHTML = `
    ${identifiedMealSection || ''}
    ${recipesHTML}
  `;
}

async function toggleRecipeDetails(recipeId) {
  const recipeCard = document.querySelector(`.recipe-card[data-recipe-id="${recipeId}"]`);
  const fullContent = recipeCard.querySelector('.recipe-full-content');
  const viewButton = recipeCard.querySelector('.view-details-btn');
  
  if (fullContent.style.display === 'none') {
    try {
      viewButton.innerHTML = 'Loading... <i class="fas fa-spinner fa-spin"></i>';
      
      const response = await fetch(
        `https://api.spoonacular.com/recipes/${recipeId}/information?apiKey=${SPOONACULAR_API_KEY}`
      );
      const recipe = await response.json();

      const nutritionResponse = await fetch(
        `https://api.spoonacular.com/recipes/${recipeId}/nutritionWidget.json?apiKey=${SPOONACULAR_API_KEY}`
      );
      const nutrition = await nutritionResponse.json();

      fullContent.innerHTML = `
        <div class="recipe-content">
          <div class="ingredients-section">
            <h4>Ingredients</h4>
            <ul class="ingredients-list">
              ${recipe.extendedIngredients.map(ingredient => `
                <li>
                  <span class="ingredient-amount">${ingredient.amount} ${ingredient.unit}</span>
                  <span class="ingredient-name">${ingredient.name}</span>
                </li>
              `).join('')}
            </ul>
          </div>

          <div class="instructions-section">
            <h4>Instructions</h4>
            ${recipe.analyzedInstructions[0] ? `
              <ol class="instructions-list">
                ${recipe.analyzedInstructions[0].steps.map(step => `
                  <li>
                    <span class="step-number">${step.number}</span>
                    <span class="step-text">${step.step}</span>
                  </li>
                `).join('')}
              </ol>
            ` : '<p>No detailed instructions available.</p>'}
          </div>

          <div class="recipe-footer">
            <div class="nutrition-info">
              <h4>Nutrition (per serving)</h4>
              <div class="nutrition-grid">
                <div>Calories: ${nutrition.calories || 'N/A'}</div>
                <div>Protein: ${nutrition.protein || 'N/A'}</div>
                <div>Carbs: ${nutrition.carbs || 'N/A'}</div>
                <div>Fat: ${nutrition.fat || 'N/A'}</div>
              </div>
            </div>
            <a href="${recipe.sourceUrl}" target="_blank" class="source-link">View Original Recipe</a>
          </div>
        </div>
      `;

      fullContent.style.display = 'block';
      viewButton.innerHTML = 'Hide Full Recipe <i class="fas fa-chevron-up"></i>';
      recipeCard.classList.remove('collapsed');
    } catch (error) {
      console.error('Error loading recipe details:', error);
      viewButton.innerHTML = 'Error loading details <i class="fas fa-exclamation-circle"></i>';
    }
  } else {
    fullContent.style.display = 'none';
    viewButton.innerHTML = 'View Full Recipe <i class="fas fa-chevron-down"></i>';
    recipeCard.classList.add('collapsed');
  }
}

function handleOtherMatchSelection(matchDescription) {
  const recipeResults = document.getElementById('recipeResults');
  const identifiedMealSection = recipeResults.querySelector('.identified-meal');
  
  const primaryMatch = identifiedMealSection.querySelector('.primary-match');
  const previousMatch = primaryMatch.textContent;
  primaryMatch.textContent = matchDescription;
  
  const otherMatches = identifiedMealSection.querySelector('.other-matches ul');
  const newMatchItem = document.createElement('li');
  newMatchItem.innerHTML = `
    <span class="clickable-match" onclick="handleOtherMatchSelection('${previousMatch}')">${previousMatch}</span>
  `;
  otherMatches.insertBefore(newMatchItem, otherMatches.firstChild);
  
  searchRecipesByMealName(matchDescription);
}

function updateIdentifiedMealSection(bestMatch, otherMatches) {
  return `
    <div class="identified-meal">
      <h3>Identified Food:</h3>
      <p class="primary-match">${bestMatch.description} 
        ${bestMatch.score ? `(${Math.round(bestMatch.score * 100)}% confidence)` : ''}
      </p>
      ${otherMatches.length > 0 ? `
        <div class="other-matches">
          <p>Other possible matches:</p>
          <ul>
            ${otherMatches.map(match => `
              <li>
                <span class="clickable-match" onclick="handleOtherMatchSelection('${match.description}')">
                  ${match.description}
                  ${match.score ? ` (${Math.round(match.score * 100)}%)` : ''}
                </span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

async function handleOtherMatchSelection(matchDescription) {
  const recipeResults = document.getElementById('recipeResults');
  const identifiedMealSection = recipeResults.querySelector('.identified-meal');
  
  recipeResults.innerHTML = `
    ${identifiedMealSection.outerHTML}
    <div class="loading">Searching recipes for ${matchDescription}...</div>
  `;

  try {
    const recipes = await tryMultipleSearchStrategies(matchDescription);
    
    if (recipes.length > 0) {
      displayDetailedRecipes(recipes, matchDescription, false);
    } else {
      const cuisineType = detectCuisineType(matchDescription);
      const similarRecipes = await findSimilarRecipes(matchDescription, cuisineType);
      displayDetailedRecipes(similarRecipes, matchDescription, true);
    }
  } catch (error) {
    console.error('Error searching for other match:', error);
    showError(`Failed to find recipes for ${matchDescription}`);
  }
}

async function getSimilarMealSuggestions(mealName) {
  try {
    const response = await fetch(
      `https://api.spoonacular.com/recipes/autocomplete?apiKey=${SPOONACULAR_API_KEY}&query=${encodeURIComponent(mealName)}&number=5`
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting suggestions:', error);
    return [];
  }
}

function displayMealSuggestions(searchTerm, suggestions) {
  const recipeResults = document.getElementById('recipeResults');
  
  recipeResults.innerHTML = `
    <div class="search-results">
      <div class="search-summary">
        <p>No exact matches found for "${searchTerm}"</p>
        ${suggestions.length > 0 ? `
          <div class="suggestions-section">
            <h3>Did you mean:</h3>
            <ul class="suggestions-list">
              ${suggestions.map(suggestion => `
                <li>
                  <span class="clickable-match" onclick="handleSuggestionClick('${suggestion.title}')">
                    ${suggestion.title}
                  </span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function handleSuggestionClick(mealName) {
  document.getElementById('ingredientInput').value = mealName;
  searchMealByText();
}

function displayImageAnalysisResults(bestMatch, otherMatches) {
  const recipeResults = document.getElementById('recipeResults');
  
  recipeResults.innerHTML = `
    <div class="identified-meal">
      <h3>Identified Food:</h3>
      <p class="primary-match">
        ${bestMatch.description}
        ${bestMatch.score ? ` (${Math.round(bestMatch.score * 100)}% confidence)` : ''}
      </p>
      ${otherMatches.length > 0 ? `
        <div class="other-matches">
          <p>Other possible matches:</p>
          <ul>
            ${otherMatches.map(match => `
              <li>
                <span class="clickable-match" 
                      onclick="handleOtherMatchSelection('${match.description}')"
                      data-confidence="${match.score || 0}">
                  ${match.description}
                  ${match.score ? ` (${Math.round(match.score * 100)}%)` : ''}
                </span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;

  searchRecipesByMealName(bestMatch.description);
}

// Add drag and drop functionality for image upload
const uploadArea = document.getElementById('uploadArea');
const mealImageInput = document.getElementById('mealImageInput');

uploadArea.addEventListener('click', () => {
  mealImageInput.click();
});

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    mealImageInput.files = e.dataTransfer.files;
    handleImagePreview(file);
  }
});

mealImageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    handleImagePreview(file);
  }
});

function handleImagePreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadArea.innerHTML = `
      <img src="${e.target.result}" alt="Preview" style="max-width: 100%; max-height: 200px; border-radius: 8px;">
    `;
  };
  reader.readAsDataURL(file);
}

// Add cooking tips carousel
const tips = [
  { icon: '🕒', title: 'Prep First', text: 'Always read the recipe completely and prep ingredients before starting.' },
  { icon: '🌡️', title: 'Room Temperature', text: 'Let ingredients come to room temperature for even cooking.' },
  { icon: '🧂', title: 'Season Gradually', text: 'Season throughout cooking, not just at the end.' },
  // Add more tips...
];

function initTipsCarousel() {
  const carousel = document.querySelector('.tips-carousel');
  tips.forEach(tip => {
    carousel.innerHTML += `
      <div class="tip-card">
        <div class="tip-icon">${tip.icon}</div>
        <h4>${tip.title}</h4>
        <p>${tip.text}</p>
      </div>
    `;
  });
}

// Initialize tips on load
document.addEventListener('DOMContentLoaded', initTipsCarousel);

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: 14,
    center: { lat: -34.397, lng: 150.644 },
  });
  infoWindow = new google.maps.InfoWindow();
}

async function searchNearbyRestaurants(searchTerm, location) {
  const service = new google.maps.places.PlacesService(map);
  
  const request = {
    location: location,
    radius: '5000',
    type: ['restaurant'],
    keyword: searchTerm
  };

  service.nearbySearch(request, (results, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK) {
      clearMarkers();
      displayRestaurants(results);
      addMarkers(results);
    }
  });
}

function displayRestaurants(restaurants) {
  const restaurantsList = document.getElementById('restaurantsList');
  restaurantsList.innerHTML = '';

  restaurants.forEach(restaurant => {
    const card = `
      <div class="restaurant-card">
        <div class="restaurant-info">
          <div class="restaurant-name">${restaurant.name}</div>
          <div class="restaurant-rating">
            <div class="rating-stars">
              ${getStarRating(restaurant.rating)}
            </div>
            <span>${restaurant.rating} (${restaurant.user_ratings_total} reviews)</span>
          </div>
          <div class="restaurant-details">
            <p>${restaurant.vicinity}</p>
            ${restaurant.opening_hours?.open_now ? 
              '<p class="open-now"><i class="fas fa-clock"></i> Open now</p>' : 
              '<p class="closed">Closed</p>'
            }
          </div>
          <div class="restaurant-actions">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(restaurant.vicinity)}" 
               class="directions-link" target="_blank">
              <i class="fas fa-directions"></i> Directions
            </a>
            ${restaurant.website ? 
              `<a href="${restaurant.website}" class="website-link" target="_blank">
                <i class="fas fa-globe"></i> Website
               </a>` : ''
            }
          </div>
        </div>
      </div>
    `;
    restaurantsList.innerHTML += card;
  });
}

function getStarRating(rating) {
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5;
  let stars = '';
  
  for (let i = 0; i < fullStars; i++) {
    stars += '<i class="fas fa-star"></i>';
  }
  if (halfStar) {
    stars += '<i class="fas fa-star-half-alt"></i>';
  }
  return stars;
}

function addMarkers(restaurants) {
  restaurants.forEach(restaurant => {
    const marker = new google.maps.Marker({
      position: restaurant.geometry.location,
      map: map,
      title: restaurant.name
    });

    marker.addListener('click', () => {
      infoWindow.setContent(`
        <div class="info-window">
          <h3>${restaurant.name}</h3>
          <p>${restaurant.vicinity}</p>
          <p>Rating: ${restaurant.rating} ⭐</p>
        </div>
      `);
      infoWindow.open(map, marker);
    });

    markers.push(marker);
  });

  // Center map on markers
  const bounds = new google.maps.LatLngBounds();
  markers.forEach(marker => bounds.extend(marker.getPosition()));
  map.fitBounds(bounds);
}

function clearMarkers() {
  markers.forEach(marker => marker.setMap(null));
  markers = [];
}

document.getElementById('useCurrentLocation').addEventListener('click', () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        map.setCenter(pos);
        searchNearbyRestaurants(currentSearchTerm, pos);
      },
      () => {
        alert('Error: The Geolocation service failed.');
      }
    );
  } else {
    alert('Error: Your browser doesn\'t support geolocation.');
  }
});

function getFallbackRecipes(searchTerm) {
  // Normalize search term
  const normalizedSearch = searchTerm.toLowerCase().trim();
  
  // Check cached recipes
  if (CACHED_RECIPES[normalizedSearch]) {
    return CACHED_RECIPES[normalizedSearch];
  }

  // If no exact match, try to find similar recipes
  for (const [key, recipes] of Object.entries(CACHED_RECIPES)) {
    if (key.includes(normalizedSearch) || normalizedSearch.includes(key)) {
      return recipes;
    }
  }

  // If still no match, return curated web results
  return [];
}

// Update API call function
async function makeSpoonacularRequest(endpoint, params) {
  try {
    await RateLimiter.checkLimit();
    // Make API call
    // ...
  } catch (error) {
    if (error.message === 'API limit reached') {
      return getFallbackRecipes(params.query);
    }
    throw error;
  }
}

// Add this function to automatically clean old cache entries
async function cleanupOldCache() {
    try {
        const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
        const params = {
            TableName: 'recipes-cache',
            FilterExpression: 'timestamp < :old',
            ExpressionAttributeValues: {
                ':old': thirtyDaysAgo
            }
        };
        
        const result = await dynamoDB.scan(params).promise();
        const deletePromises = result.Items.map(item => 
            dynamoDB.delete({
                TableName: 'recipes-cache',
                Key: { id: item.id }
            }).promise()
        );
        
        await Promise.all(deletePromises);
        console.log(`Cleaned up ${deletePromises.length} old cache entries`);
    } catch (error) {
        console.error('Cache cleanup error:', error);
    }
}

// Run cleanup once a day
setInterval(cleanupOldCache, 24 * 60 * 60 * 1000);
