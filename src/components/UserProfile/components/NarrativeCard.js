// frontend/src/components/UserProfile/components/NarrativeCard.js
import React, { useContext } from "react";
import { AccountDataContext } from "../UserProfile"; // Adjust the path if needed

const NarrativeCard = () => {
  const accountData = useContext(AccountDataContext);

  if (!accountData || !accountData.analysis || !accountData.analysis.narrative) {
    return <div>Loading narrative...</div>;
  }

  const { narrative1, narrative2, narrative3 } = accountData.analysis.narrative;

  return (
    <div className="narrative-card">
      {narrative1 && <p>{narrative1}</p>}
      {narrative2 && <p>{narrative2}</p>}
      {narrative3 && <p>{narrative3}</p>}
    </div>
  );
};

export default NarrativeCard;
