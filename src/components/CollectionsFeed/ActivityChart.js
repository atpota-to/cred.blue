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

const ActivityChart = ({ records, collections }) => {
  const [timePeriod, setTimePeriod] = useState('7days');
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: []
  });
  
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
    
    switch (period) {
      case '7days':
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 7);
        dateFormat = { month: 'short', day: 'numeric' }; // "Jan 1"
        break;
      case '30days':
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 30);
        dateFormat = { month: 'short', day: 'numeric' }; // "Jan 1"
        break;
      case '90days':
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 90);
        dateFormat = { month: 'short' }; // "January"
        break;
      default:
        startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() - 7);
        dateFormat = { month: 'short', day: 'numeric' }; // "Jan 1"
    }
    
    // Create date buckets
    const dateBuckets = {};
    const labels = [];
    
    // Initialize date buckets based on the selected time period
    let currentBucket = new Date(startDate);
    
    while (currentBucket <= currentDate) {
      const dateKey = currentBucket.toISOString().split('T')[0]; // YYYY-MM-DD
      const formattedDate = currentBucket.toLocaleDateString('en-US', dateFormat);
      
      dateBuckets[dateKey] = {
        date: formattedDate,
        total: 0,
        bskyRecords: 0,
        nonBskyRecords: 0
      };
      
      labels.push(formattedDate);
      
      // Move to next day
      currentBucket.setDate(currentBucket.getDate() + 1);
    }
    
    // Count records for each date
    allRecords.forEach(record => {
      // Use either content timestamp or rkey timestamp, prioritizing content
      const timestamp = record.contentTimestamp || record.rkeyTimestamp;
      if (!timestamp) return;
      
      const recordDate = new Date(timestamp);
      const dateKey = recordDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Only count if within our date range
      if (dateBuckets[dateKey]) {
        dateBuckets[dateKey].total += 1;
        
        // Also track Bluesky vs non-Bluesky records
        if (record.collection.startsWith('app.bsky.')) {
          dateBuckets[dateKey].bskyRecords += 1;
        } else {
          dateBuckets[dateKey].nonBskyRecords += 1;
        }
      }
    });
    
    // Format data for Chart.js
    const totalData = [];
    const bskyData = [];
    const nonBskyData = [];
    
    // Extract data in the same order as labels
    labels.forEach(label => {
      // Find the matching bucket by formatted date
      const bucket = Object.values(dateBuckets).find(b => b.date === label);
      
      if (bucket) {
        totalData.push(bucket.total);
        bskyData.push(bucket.bskyRecords);
        nonBskyData.push(bucket.nonBskyRecords);
      } else {
        // Fallback (shouldn't happen)
        totalData.push(0);
        bskyData.push(0);
        nonBskyData.push(0);
      }
    });
    
    // Set the chart data
    setChartData({
      labels,
      datasets: [
        {
          label: 'All Records',
          data: totalData,
          backgroundColor: 'rgba(0, 133, 255, 0.6)',
          borderColor: 'rgba(0, 133, 255, 1)',
          borderWidth: 1
        },
        {
          label: 'Bluesky Records',
          data: bskyData,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        },
        {
          label: 'Other ATProto Records',
          data: nonBskyData,
          backgroundColor: 'rgba(153, 102, 255, 0.6)',
          borderColor: 'rgba(153, 102, 255, 1)',
          borderWidth: 1
        }
      ]
    });
  };
  
  // Chart options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'ATProto Activity by Date'
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
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Date'
        }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Number of Records'
        }
      }
    }
  };
  
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