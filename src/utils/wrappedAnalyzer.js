/**
 * Wrapped Analyzer
 * 
 * This module analyzes parsed CAR file data to generate insights for the Bluesky Wrapped feature.
 * It processes posts, likes, follows, and other activities to create year-over-year comparisons
 * and interesting statistics.
 */

/**
 * Analyze all records from a parsed repo to generate wrapped statistics
 * @param {Object} records - The records object from carParser.extractRecords()
 * @param {string} did - The user's DID
 * @returns {Object} Comprehensive analysis of the user's activity
 */
export function analyzeWrappedData(records, did) {
  console.log('Starting wrapped data analysis...');
  const startTime = performance.now();

  const analysis = {
    did,
    generatedAt: new Date().toISOString(),
    
    // Overall statistics
    overall: analyzeOverallStats(records),
    
    // Year-by-year breakdown
    byYear: analyzeByYear(records),
    
    // Posting patterns
    patterns: analyzePatterns(records),
    
    // Top content
    topContent: analyzeTopContent(records),
    
    // Social insights
    social: analyzeSocialActivity(records),
    
    // Growth metrics
    growth: analyzeGrowth(records),
    
    // Fun facts
    funFacts: generateFunFacts(records),
    
    // Top mentions
    topMentions: extractMentions(records),
    
    // Top emojis
    topEmojis: extractEmojis(records),
    
    // Other collections breakdown
    otherCollections: analyzeOtherCollections(records)
  };

  const analysisTime = performance.now() - startTime;
  console.log(`Analysis completed in ${analysisTime.toFixed(0)}ms`);

  return analysis;
}

/**
 * Analyze overall statistics across all time
 */
function analyzeOverallStats(records) {
  const now = new Date();
  const allDates = [];
  
  // Collect all dates from posts
  records.posts.forEach(post => {
    if (post.createdAt) {
      allDates.push(new Date(post.createdAt));
    }
  });
  
  // Find first and last post
  const sortedDates = allDates.sort((a, b) => a - b);
  const firstPost = sortedDates[0];
  const lastPost = sortedDates[sortedDates.length - 1];
  
  // Calculate account age
  const accountAgeDays = firstPost 
    ? Math.floor((now - firstPost) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    totalPosts: records.posts.length,
    totalLikes: records.likes.length,
    totalReposts: records.reposts.length,
    totalFollows: records.follows.length,
    totalBlocks: records.blocks.length,
    totalLists: records.lists.length,
    accountAgeDays,
    firstPostDate: firstPost ? firstPost.toISOString() : null,
    lastPostDate: lastPost ? lastPost.toISOString() : null,
    collections: records.collections
  };
}

/**
 * Break down activity by year
 */
function analyzeByYear(records) {
  const yearData = {};

  // Process posts by year
  records.posts.forEach(post => {
    if (post.createdAt) {
      const year = new Date(post.createdAt).getFullYear();
      if (!yearData[year]) {
        yearData[year] = {
          year,
          posts: [],
          likes: [],
          reposts: [],
          follows: [],
          postsWithImages: 0,
          postsWithLinks: 0,
          postsWithReplies: 0,
          totalCharacters: 0
        };
      }
      yearData[year].posts.push(post);
      
      // Count posts with images
      if (post.embed && (post.embed.$type === 'app.bsky.embed.images' || 
          post.embed.$type === 'app.bsky.embed.recordWithMedia')) {
        yearData[year].postsWithImages++;
      }
      
      // Count posts with links
      if (post.facets && post.facets.some(f => 
        f.features && f.features.some(feat => feat.$type === 'app.bsky.richtext.facet#link')
      )) {
        yearData[year].postsWithLinks++;
      }
      
      // Count replies
      if (post.reply) {
        yearData[year].postsWithReplies++;
      }
      
      // Count characters
      if (post.text) {
        yearData[year].totalCharacters += post.text.length;
      }
    }
  });

  // Process likes by year
  records.likes.forEach(like => {
    if (like.createdAt) {
      const year = new Date(like.createdAt).getFullYear();
      if (yearData[year]) {
        yearData[year].likes.push(like);
      }
    }
  });

  // Process reposts by year
  records.reposts.forEach(repost => {
    if (repost.createdAt) {
      const year = new Date(repost.createdAt).getFullYear();
      if (yearData[year]) {
        yearData[year].reposts.push(repost);
      }
    }
  });

  // Process follows by year
  records.follows.forEach(follow => {
    if (follow.createdAt) {
      const year = new Date(follow.createdAt).getFullYear();
      if (yearData[year]) {
        yearData[year].follows.push(follow);
      }
    }
  });

  // Calculate summaries for each year
  Object.keys(yearData).forEach(year => {
    const data = yearData[year];
    data.totalPosts = data.posts.length;
    data.totalLikes = data.likes.length;
    data.totalReposts = data.reposts.length;
    data.totalFollows = data.follows.length;
    data.avgPostLength = data.totalPosts > 0 
      ? Math.round(data.totalCharacters / data.totalPosts) 
      : 0;
  });

  return yearData;
}

/**
 * Analyze posting patterns (time of day, day of week, etc.)
 */
function analyzePatterns(records) {
  const hourCounts = new Array(24).fill(0);
  const dayOfWeekCounts = new Array(7).fill(0);
  const monthCounts = new Array(12).fill(0);

  records.posts.forEach(post => {
    if (post.createdAt) {
      const date = new Date(post.createdAt);
      hourCounts[date.getHours()]++;
      dayOfWeekCounts[date.getDay()]++;
      monthCounts[date.getMonth()]++;
    }
  });

  // Find most active hour
  const mostActiveHour = hourCounts.indexOf(Math.max(...hourCounts));
  
  // Find most active day of week
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const mostActiveDayIndex = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts));
  const mostActiveDay = dayNames[mostActiveDayIndex];
  
  // Find most active month
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const mostActiveMonthIndex = monthCounts.indexOf(Math.max(...monthCounts));
  const mostActiveMonth = monthNames[mostActiveMonthIndex];

  return {
    hourCounts,
    dayOfWeekCounts,
    monthCounts,
    mostActiveHour,
    mostActiveDay,
    mostActiveMonth,
    isNightOwl: mostActiveHour >= 22 || mostActiveHour <= 4,
    isEarlyBird: mostActiveHour >= 5 && mostActiveHour <= 8
  };
}

/**
 * Analyze top content (most liked posts, etc.)
 */
function analyzeTopContent(records) {
  // Sort posts by engagement (replies + likes + reposts if we had that data)
  // For now, we'll just return the most recent posts as examples
  const recentPosts = records.posts
    .filter(p => p.text)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  // Find posts with images
  const postsWithImages = records.posts.filter(p => 
    p.embed && (p.embed.$type === 'app.bsky.embed.images' || 
                p.embed.$type === 'app.bsky.embed.recordWithMedia')
  );

  // Find longest post
  const longestPost = records.posts.reduce((longest, post) => {
    if (!post.text) return longest;
    if (!longest || post.text.length > longest.text.length) {
      return post;
    }
    return longest;
  }, null);

  // Find shortest post (with text)
  const shortestPost = records.posts
    .filter(p => p.text && p.text.length > 0)
    .reduce((shortest, post) => {
      if (!shortest || post.text.length < shortest.text.length) {
        return post;
      }
      return shortest;
    }, null);

  return {
    recentPosts,
    postsWithImagesCount: postsWithImages.length,
    longestPost,
    shortestPost
  };
}

/**
 * Analyze social activity (follows, blocks, etc.)
 */
function analyzeSocialActivity(records) {
  // Analyze follow patterns
  const followsByYear = {};
  records.follows.forEach(follow => {
    if (follow.createdAt) {
      const year = new Date(follow.createdAt).getFullYear();
      followsByYear[year] = (followsByYear[year] || 0) + 1;
    }
  });

  // Calculate follow rate
  const sortedFollows = records.follows
    .filter(f => f.createdAt)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  const firstFollow = sortedFollows[0];
  const lastFollow = sortedFollows[sortedFollows.length - 1];
  
  let followsPerDay = 0;
  if (firstFollow && lastFollow) {
    const daysDiff = Math.max(1, 
      (new Date(lastFollow.createdAt) - new Date(firstFollow.createdAt)) / (1000 * 60 * 60 * 24)
    );
    followsPerDay = records.follows.length / daysDiff;
  }

  return {
    totalFollows: records.follows.length,
    totalBlocks: records.blocks.length,
    totalLists: records.lists.length,
    totalListItems: records.listItems.length,
    followsByYear,
    followsPerDay: followsPerDay.toFixed(2),
    firstFollowDate: firstFollow ? firstFollow.createdAt : null,
    lastFollowDate: lastFollow ? lastFollow.createdAt : null
  };
}

/**
 * Calculate growth metrics and year-over-year changes
 */
function analyzeGrowth(records) {
  const yearData = analyzeByYear(records);
  const years = Object.keys(yearData).map(Number).sort();
  
  const growth = {};
  
  for (let i = 1; i < years.length; i++) {
    const prevYear = years[i - 1];
    const currYear = years[i];
    const prev = yearData[prevYear];
    const curr = yearData[currYear];
    
    growth[currYear] = {
      year: currYear,
      postsChange: calculatePercentChange(prev.totalPosts, curr.totalPosts),
      likesChange: calculatePercentChange(prev.totalLikes, curr.totalLikes),
      repostsChange: calculatePercentChange(prev.totalReposts, curr.totalReposts),
      followsChange: calculatePercentChange(prev.totalFollows, curr.totalFollows)
    };
  }
  
  return growth;
}

/**
 * Helper function to calculate percent change
 */
function calculatePercentChange(oldVal, newVal) {
  if (oldVal === 0) return newVal > 0 ? 100 : 0;
  return Math.round(((newVal - oldVal) / oldVal) * 100);
}

/**
 * Common words to filter out (stop words)
 */
const STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
  'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
  'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
  'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
  'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year',
  'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
  'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
  'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even',
  'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is',
  'was', 'are', 'been', 'has', 'had', 'were', 'said', 'did', 'having', 'may',
  'should', 'does', 'being', 'am', 'much', 'more', 'very', 'too', 'really',
  'dont', 'doesnt', 'didnt', 'wasnt', 'werent', 'isnt', 'arent', 'cant', 'wont',
  'wouldnt', 'shouldnt', 'couldnt', 'im', 'ive', 'youre', 'youve', 'thats',
  'theres', 'hes', 'shes', 'its', 'were', 'theyre', 'theyve'
]);

/**
 * Extract mentions from posts
 */
function extractMentions(records) {
  const mentionCounts = {};
  
  records.posts.forEach(post => {
    if (post.facets) {
      post.facets.forEach(facet => {
        if (facet.features) {
          facet.features.forEach(feature => {
            if (feature.$type === 'app.bsky.richtext.facet#mention' && feature.did) {
              mentionCounts[feature.did] = (mentionCounts[feature.did] || 0) + 1;
            }
          });
        }
      });
    }
  });
  
  return Object.entries(mentionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([did, count]) => ({ did, count }));
}

/**
 * Extract emojis from posts
 */
function extractEmojis(records) {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojiCounts = {};
  
  records.posts.forEach(post => {
    if (post.text) {
      const emojis = post.text.match(emojiRegex);
      if (emojis) {
        emojis.forEach(emoji => {
          emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
        });
      }
    }
  });
  
  return Object.entries(emojiCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([emoji, count]) => ({ emoji, count }));
}

/**
 * Analyze "Other" collections in detail
 */
function analyzeOtherCollections(records) {
  const collectionBreakdown = {};
  
  records.other.forEach(record => {
    const type = record.type || record.$type || 'unknown';
    if (!collectionBreakdown[type]) {
      collectionBreakdown[type] = {
        count: 0,
        samples: []
      };
    }
    collectionBreakdown[type].count++;
    if (collectionBreakdown[type].samples.length < 3) {
      collectionBreakdown[type].samples.push(record);
    }
  });
  
  return collectionBreakdown;
}

/**
 * Generate fun facts and interesting insights
 */
function generateFunFacts(records) {
  const facts = [];
  
  // Total words posted
  const totalWords = records.posts.reduce((sum, post) => {
    if (post.text) {
      return sum + post.text.split(/\s+/).length;
    }
    return sum;
  }, 0);
  facts.push(`You've posted ${totalWords.toLocaleString()} words on Bluesky`);
  
  // Average post length
  const avgPostLength = records.posts.length > 0
    ? Math.round(totalWords / records.posts.length)
    : 0;
  facts.push(`Your average post is ${avgPostLength} words long`);
  
  // Posting frequency
  const sortedPosts = records.posts
    .filter(p => p.createdAt)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  if (sortedPosts.length >= 2) {
    const firstPost = new Date(sortedPosts[0].createdAt);
    const lastPost = new Date(sortedPosts[sortedPosts.length - 1].createdAt);
    const daysDiff = Math.max(1, (lastPost - firstPost) / (1000 * 60 * 60 * 24));
    const postsPerDay = (records.posts.length / daysDiff).toFixed(1);
    facts.push(`You post an average of ${postsPerDay} times per day`);
  }
  
  // Reply ratio
  const replyCount = records.posts.filter(p => p.reply).length;
  const replyRatio = records.posts.length > 0
    ? Math.round((replyCount / records.posts.length) * 100)
    : 0;
  facts.push(`${replyRatio}% of your posts are replies`);
  
  // Image usage
  const imagePostCount = records.posts.filter(p => 
    p.embed && (p.embed.$type === 'app.bsky.embed.images' || 
                p.embed.$type === 'app.bsky.embed.recordWithMedia')
  ).length;
  const imageRatio = records.posts.length > 0
    ? Math.round((imagePostCount / records.posts.length) * 100)
    : 0;
  facts.push(`${imageRatio}% of your posts include images`);
  
  // Like to post ratio
  const likeToPostRatio = records.posts.length > 0
    ? (records.likes.length / records.posts.length).toFixed(1)
    : 0;
  facts.push(`You give ${likeToPostRatio} likes for every post you make`);
  
  // Most used meaningful words (filtered)
  const wordFreq = {};
  records.posts.forEach(post => {
    if (post.text) {
      const words = post.text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !STOP_WORDS.has(w));
      
      words.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      });
    }
  });
  
  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
  
  if (topWords.length > 0) {
    facts.push(`Your most used words: ${topWords.join(', ')}`);
  }
  
  // Top emoji
  const topEmojis = extractEmojis(records);
  if (topEmojis.length > 0) {
    facts.push(`Your favorite emoji: ${topEmojis[0].emoji} (used ${topEmojis[0].count} times)`);
  }
  
  // Top mentions
  const topMentions = extractMentions(records);
  if (topMentions.length > 0) {
    facts.push(`You've mentioned ${topMentions.length} different users`);
  }
  
  return facts;
}

/**
 * Generate a summary text for the wrapped
 */
export function generateWrappedSummary(analysis) {
  const currentYear = new Date().getFullYear();
  const thisYearData = analysis.byYear[currentYear];
  
  if (!thisYearData) {
    return "Your Bluesky journey is just beginning!";
  }
  
  const parts = [];
  
  parts.push(`In ${currentYear}, you posted ${thisYearData.totalPosts} times`);
  
  if (thisYearData.totalLikes > 0) {
    parts.push(`gave ${thisYearData.totalLikes} likes`);
  }
  
  if (thisYearData.totalFollows > 0) {
    parts.push(`followed ${thisYearData.totalFollows} new accounts`);
  }
  
  if (analysis.patterns.mostActiveMonth) {
    parts.push(`Your most active month was ${analysis.patterns.mostActiveMonth}`);
  }
  
  return parts.join(', ') + '.';
}

/**
 * Get year-over-year comparison for a specific year
 */
export function getYearComparison(analysis, year) {
  const yearData = analysis.byYear[year];
  const prevYearData = analysis.byYear[year - 1];
  
  if (!yearData) {
    return null;
  }
  
  const comparison = {
    year,
    stats: {
      posts: yearData.totalPosts,
      likes: yearData.totalLikes,
      reposts: yearData.totalReposts,
      follows: yearData.totalFollows
    }
  };
  
  if (prevYearData) {
    comparison.changes = {
      posts: calculatePercentChange(prevYearData.totalPosts, yearData.totalPosts),
      likes: calculatePercentChange(prevYearData.totalLikes, yearData.totalLikes),
      reposts: calculatePercentChange(prevYearData.totalReposts, yearData.totalReposts),
      follows: calculatePercentChange(prevYearData.totalFollows, yearData.totalFollows)
    };
  }
  
  return comparison;
}

