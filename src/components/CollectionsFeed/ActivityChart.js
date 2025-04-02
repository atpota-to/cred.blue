import React, { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import './ActivityChart.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const ActivityChart = ({ records, collections, loading = false }) => {
  const [timePeriod, setTimePeriod] = useState('7days');
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: []
  });
  
  // App color scheme
  const bskyColor = 'rgba(0, 133, 255, 0.7)'; // Lighter blue for Bluesky
  const bskyBorderColor = 'rgba(0, 133, 255, 1)';
  const atprotoColor = 'rgba(0, 51, 102, 0.8)'; // Darker blue for ATProto
  const atprotoBorderColor = 'rgba(0, 51, 102, 1)';
  
  useEffect(() => {
    // Only generate chart data if we have records
    if (records && records.length > 0) {
      generateChartData(records, timePeriod);
    }
  }, [records, timePeriod]);
  
  // Function to generate data for the chart based on selected time period
  const generateChartData = (allRecords, period) => {
    // Determine date range based on selected period
    const currentDate = new Date();
    let startDate;
    let dateFormat;
    let bucketSize;
    let timeFormat;
    
    switch (period) {
      case '24hours':
        startDate = new Date(currentDate);
        startDate.setHours(currentDate.getHours() - 24);
        dateFormat = { hour: '2-digit' }; // "05 PM"
        bucketSize = 'hour';
        timeFormat = true;
        break;
      case '7days':
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 7);
        dateFormat = { month: 'short', day: 'numeric' }; // "Jan 1"
        bucketSize = 'day';
        timeFormat = false;
        break;
      case '30days':
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 30);
        dateFormat = { month: 'short', day: 'numeric' }; // "Jan 1"
        bucketSize = 'day';
        timeFormat = false;
        break;
      case '90days':
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 90);
        // For 90 days, group by week instead of day to make it more readable
        dateFormat = { month: 'short', day: 'numeric' }; 
        bucketSize = 'week';
        timeFormat = false;
        break;
      default:
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 7);
        dateFormat = { month: 'short', day: 'numeric' }; // "Jan 1"
        bucketSize = 'day';
        timeFormat = false;
    }
    
    // Create date buckets
    const dateBuckets = {};
    const labels = [];
    
    // For 90 days with weekly buckets, calculate week numbers
    if (bucketSize === 'week') {
      // Create weekly buckets
      let currentWeekStart = new Date(startDate);
      // Adjust to start on Sunday or Monday (Sunday = 0, Monday = 1)
      const dayOfWeek = currentWeekStart.getDay();
      if (dayOfWeek !== 0) { // If not Sunday
        // Adjust date to previous Sunday
        currentWeekStart.setDate(currentWeekStart.getDate() - dayOfWeek);
      }
      
      while (currentWeekStart <= currentDate) {
        const weekEndDate = new Date(currentWeekStart);
        weekEndDate.setDate(weekEndDate.getDate() + 6); // End date is 6 days after start (for a full week)
        
        const bucketKey = currentWeekStart.toISOString().split('T')[0];
        const startLabel = currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endLabel = weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const weekLabel = `${startLabel} - ${endLabel}`;
        
        dateBuckets[bucketKey] = {
          label: weekLabel,
          start: new Date(currentWeekStart), // Store start and end dates for filtering
          end: new Date(weekEndDate),
          bskyRecords: 0,
          atprotoRecords: 0
        };
        
        labels.push(weekLabel);
        
        // Move to next week
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      }
    } 
    else if (bucketSize === 'hour') {
      // Create hourly buckets for 24-hour view
      let currentHour = new Date(startDate);
      currentHour.setMinutes(0, 0, 0); // Start at the beginning of the hour
      
      while (currentHour <= currentDate) {
        const hourKey = currentHour.toISOString();
        let hourLabel;
        
        if (timeFormat) {
          hourLabel = currentHour.toLocaleTimeString('en-US', { hour: '2-digit' });
        } else {
          hourLabel = currentHour.toLocaleDateString('en-US', dateFormat);
        }
        
        dateBuckets[hourKey] = {
          label: hourLabel,
          timestamp: new Date(currentHour),
          bskyRecords: 0,
          atprotoRecords: 0
        };
        
        labels.push(hourLabel);
        
        // Move to next hour
        currentHour.setHours(currentHour.getHours() + 1);
      }
    }
    else {
      // Create daily buckets for 7-day and 30-day views
      let currentDay = new Date(startDate);
      currentDay.setHours(0, 0, 0, 0); // Start at the beginning of the day
      
      while (currentDay <= currentDate) {
        const dayKey = currentDay.toISOString().split('T')[0]; // YYYY-MM-DD
        const dayLabel = currentDay.toLocaleDateString('en-US', dateFormat);
        
        dateBuckets[dayKey] = {
          label: dayLabel,
          date: new Date(currentDay),
          bskyRecords: 0,
          atprotoRecords: 0
        };
        
        labels.push(dayLabel);
        
        // Move to next day
        currentDay.setDate(currentDay.getDate() + 1);
      }
    }
    
    // Count records for each bucket
    allRecords.forEach(record => {
      // Use either content timestamp or rkey timestamp, prioritizing content
      const timestamp = record.contentTimestamp || record.rkeyTimestamp;
      if (!timestamp) return;
      
      const recordDate = new Date(timestamp);
      
      // Find the matching bucket based on the time period type
      let matchingBucketKey = null;
      
      if (bucketSize === 'week') {
        // For weekly buckets, find the week that contains this record
        for (const bucketKey in dateBuckets) {
          const bucket = dateBuckets[bucketKey];
          if (recordDate >= bucket.start && recordDate <= bucket.end) {
            matchingBucketKey = bucketKey;
            break;
          }
        }
      } 
      else if (bucketSize === 'hour') {
        // For hourly buckets, find the hour
        const hourStart = new Date(recordDate);
        hourStart.setMinutes(0, 0, 0);
        matchingBucketKey = hourStart.toISOString();
      }
      else {
        // For daily buckets, use the date key
        matchingBucketKey = recordDate.toISOString().split('T')[0]; // YYYY-MM-DD
      }
      
      // Only count if within our date range
      if (matchingBucketKey && dateBuckets[matchingBucketKey]) {
        // Track Bluesky vs non-Bluesky records
        if (record.collection.startsWith('app.bsky.')) {
          dateBuckets[matchingBucketKey].bskyRecords += 1;
        } else {
          dateBuckets[matchingBucketKey].atprotoRecords += 1;
        }
      }
    });
    
    // Format data for Chart.js
    const bskyData = [];
    const atprotoData = [];
    
    // Extract data in the same order as labels
    labels.forEach(label => {
      // Find the matching bucket by label
      const bucket = Object.values(dateBuckets).find(b => b.label === label);
      
      if (bucket) {
        bskyData.push(bucket.bskyRecords);
        atprotoData.push(bucket.atprotoRecords);
      } else {
        // Fallback (shouldn't happen)
        bskyData.push(0);
        atprotoData.push(0);
      }
    });
    
    // Set the chart data for a stacked chart
    setChartData({
      labels,
      datasets: [
        {
          label: 'Bluesky Records',
          data: bskyData,
          backgroundColor: bskyColor,
          borderColor: bskyBorderColor,
          borderWidth: 1
        },
        {
          label: 'Other ATProto Records',
          data: atprotoData,
          backgroundColor: atprotoColor,
          borderColor: atprotoBorderColor,
          borderWidth: 1
        }
      ]
    });
  };
  
  // Chart options for stacked bar
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'ATProto Activity'
      },
      tooltip: {
        callbacks: {
          title: (tooltipItems) => {
            return tooltipItems[0].label;
          },
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.raw || 0;
            return `${label}: ${value} record${value !== 1 ? 's' : ''}`;
          },
          // Add footer for total
          footer: (tooltipItems) => {
            let sum = 0;
            tooltipItems.forEach(tooltipItem => {
              sum += tooltipItem.parsed.y;
            });
            return `Total: ${sum} record${sum !== 1 ? 's' : ''}`;
          }
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        title: {
          display: true,
          text: timePeriod === '24hours' ? 'Hour' : 'Date'
        }
      },
      y: {
        stacked: true,
        beginAtZero: true,
        title: {
          display: true,
          text: 'Number of Records'
        }
      }
    }
  };
  
  // Show loading state when fetching records deeply
  if (loading) {
    return (
      <div className="activity-chart-container">
        <div className="activity-chart-loading">
          <div className="chart-loading-spinner"></div>
          <p>Loading record data for visualization...</p>
          <p className="chart-loading-note">This may take a moment for accounts with many records</p>
        </div>
      </div>
    );
  }
  
  // Ensure records array exists and has items
  if (!records || records.length === 0) {
    return (
      <div className="activity-chart-container">
        <div className="activity-chart-empty">
          <p>No data available for chart visualization</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="activity-chart-container">
      <div className="time-period-selector">
        <button 
          className={`time-period-button ${timePeriod === '24hours' ? 'active' : ''}`}
          onClick={() => setTimePeriod('24hours')}
        >
          Last 24 Hours
        </button>
        <button 
          className={`time-period-button ${timePeriod === '7days' ? 'active' : ''}`}
          onClick={() => setTimePeriod('7days')}
        >
          Last 7 Days
        </button>
        <button 
          className={`time-period-button ${timePeriod === '30days' ? 'active' : ''}`}
          onClick={() => setTimePeriod('30days')}
        >
          Last 30 Days
        </button>
        <button 
          className={`time-period-button ${timePeriod === '90days' ? 'active' : ''}`}
          onClick={() => setTimePeriod('90days')}
        >
          Last 3 Months
        </button>
      </div>
      
      <div className="chart-container">
        <Bar data={chartData} options={options} height={300} />
      </div>
      
      <div className="chart-summary">
        <p>
          Showing activity across {collections ? collections.length : 0} collections.
        </p>
      </div>
    </div>
  );
};

export default ActivityChart;