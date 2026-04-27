// frontend/src/components/UserProfile/components/NarrativeCard.js
import React, { useContext } from "react";
import { Link } from 'react-router-dom';
import { AccountDataContext } from "../UserProfile"; // Adjust the path if needed

const NarrativeCard = () => {
  const accountData = useContext(AccountDataContext);

  if (!accountData || !accountData.analysis || !accountData.analysis.narrative) {
    return <div>Loading narrative...</div>;
  }

  const { narrative1, narrative2, narrative3 } = accountData.analysis.narrative;

  return (
    <div className="narrative-card-container">
      <div className="narrative-card">
        {narrative1 && <p>{narrative1}</p>}
        {narrative2 && <p>{narrative2}</p>}
        {narrative3 && <p>{narrative3}</p>}
      </div>
      <p className="learn-more-text">Learn more about the <Link to="/methodology" className="narrative-methodology-link">scoring methodology</Link> and <Link to="/definitions" className="narrative-methodology-link">key terms/definitions</Link> contained in this summary.</p>
      <div className="disclaimer">
        <p><strong>NOTE: </strong>This summary was <strong>not</strong> generated using AI.</p>
      </div>
    </div>
  );
};

export default NarrativeCard;
