import React, { useContext } from "react";
import { AccountDataContext } from "../UserProfile"; // Adjust the path if needed
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts';
import "./AltTextCard.css";

const emojis = ["☹️", "😐", "🙂", "☺️"];

const AltTextCard = () => {
  const accountData = useContext(AccountDataContext);

  if (!accountData || !accountData.activityAll || !accountData.activityAll["app.bsky.feed.post"]) {
    return <div className="alt-text-card">Loading alt text statistics...</div>;
  }

  const postStats = accountData.activityAll["app.bsky.feed.post"];
  const {
    postsWithImages,
    postsCount,
    imagePostsAltText,
    altTextPercentage,
    imagePostsReplies,
  } = postStats;

  // Calculate emoji based on percentage
  let emoji = emojis[0];
  if (altTextPercentage >= 0.75) {
    emoji = emojis[3];
  } else if (altTextPercentage >= 0.50) {
    emoji = emojis[2];
  } else if (altTextPercentage >= 0.25) {
    emoji = emojis[1];
  }

  // Prepare data for RadialBarChart - ensure values are numbers
  const data = [
    {
      name: 'Total Images',
      value: Number(postsWithImages) || 0,
      fill: '#FFA500',
    },
    {
      name: 'With Alt Text',
      value: Number(imagePostsAltText) || 0,
      fill: '#00cc00',
    },
  ].filter(item => item.value > 0); // Only show bars with values > 0

  return (
    <div className="alt-text-card">
      <ul>
        <li>
          <strong>{postsCount}</strong> posts analyzed
        </li>
        <li>
          <strong>{postsWithImages}</strong> contain images
        </li>
        <li>
          <strong>{imagePostsReplies}</strong> are replies
        </li>
        <li>
          <strong>{imagePostsAltText}</strong> posts have alt text
        </li>
      </ul>
      <h2>
        <strong>
          {(altTextPercentage * 100).toFixed(0)}% {emoji}
        </strong>
      </h2>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <RadialBarChart 
            cx="50%" 
            cy="50%" 
            innerRadius="30%" 
            outerRadius="80%" 
            barSize={40} 
            data={data}
            startAngle={180}
            endAngle={0}
          >
            <RadialBar
              minAngle={15}
              background={{ fill: '#eee' }}
              clockWise={false}
              dataKey="value"
            />
            <Tooltip
              formatter={(value, name) => [value, name]}
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                padding: '10px'
              }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AltTextCard;