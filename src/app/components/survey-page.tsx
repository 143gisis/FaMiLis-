import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../store/AppContext";

const CATEGORIES = [
  "COLOR",
  "FLAVOR / AROMA",
  "SALTINESS / SWEETNESS",
  "TEXTURE / VISCOSITY",
  "OVERALL PROFILE",
];

// Matches your current form layout (3–9 boxes)
const RATINGS = [3, 4, 5, 6, 7, 8, 9];

const RATING_LABELS: Record<number, string> = {
  9: "Like Extremely",
  8: "Like Very Much",
  7: "Like Moderately",
  6: "Like Slightly",
  5: "Neither Like nor Dislike",
  4: "Dislike Slightly",
  3: "Dislike Moderately",
  2: "Dislike Very Much",
  1: "Dislike Extremely",
};

export function SurveyPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();

  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [remarks, setRemarks] = useState("");

  const selectedFood = useMemo(
    () => state.foods.find((f) => f.id === state.selectedFoodId),
    [state.foods, state.selectedFoodId]
  );

  const handleRating = (category: string, value: number) => {
    setRatings((prev) => ({ ...prev, [category]: value }));
  };

  const handleSubmit = () => {
    // Use the last model output captured during recording.
    const model =
      state.lastModelOutput ||
      ({
        timestamp_ms: Date.now(),
        has_face: false,
        valence: 0,
        arousal: 0.2,
        hedonicScore: 5,
        hedonicLabel: "Neither Like nor Dislike",
      } as const);

    dispatch({
      type: "ADD_SESSION",
      payload: {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        foodId: state.selectedFoodId,
        model,
        surveyRatings: ratings,
        remarks,
      },
    });

    navigate("/admin/thank-you");
  };

  return (
    <div className="px-10 py-8" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Header */}
      <div className="bg-white px-8 py-6 rounded-[10px] mb-6">
        <h1 className="text-[32px] font-bold text-black text-center">Hedonic Sensory Evaluation Form</h1>
      </div>

      {/* Evaluation Guide */}
      <div className="bg-white px-8 py-6 rounded-[10px] mb-6 text-center">
        <h3 className="text-[20px] font-bold text-black mb-4">Evaluation Guide:</h3>
        <p className="text-[18px] text-black mb-4">Please evaluate based on the 9-point scale rating below:</p>
        <div className="grid grid-cols-3 gap-2 max-w-[800px] mx-auto text-left">
          {Object.entries(RATING_LABELS)
            .reverse()
            .map(([score, label]) => (
              <p key={score} className="text-[16px] text-black">
                <span className="font-bold">{score}</span> – {label}
              </p>
            ))}
        </div>
        <p className="text-[16px] italic text-black mt-4">*If rating is 1–2, specify on remarks</p>
      </div>

      {/* Food Sample Info */}
      <div className="bg-white border-3 border-red-600 px-8 py-4 mb-6 text-center">
        <p className="text-[22px] font-bold text-black">
          {selectedFood ? (
            <>
              {selectedFood.name} {selectedFood.variant ? `- ${selectedFood.variant}` : ""}
            </>
          ) : (
            "(Food not selected)"
          )}
        </p>
        <p className="text-[14px] text-black/60 mt-1">
          Model Hedonic: {state.lastModelOutput ? `${state.lastModelOutput.hedonicScore} - ${state.lastModelOutput.hedonicLabel}` : "-"}
        </p>
      </div>

      {/* Rating Categories */}
      {CATEGORIES.map((category, catIdx) => (
        <div
          key={category}
          className={`border border-black/50 px-8 py-6 mb-0 ${catIdx % 2 === 0 ? "bg-[#f6f7fb]" : "bg-white"}`}
        >
          <h3 className="text-[22px] font-semibold text-black mb-4">{category}</h3>
          <div className="flex gap-4 justify-start flex-wrap">
            {RATINGS.map((rating) => (
              <button
                key={rating}
                onClick={() => handleRating(category, rating)}
                className={`w-[100px] h-[60px] border-2 border-black rounded-none text-[28px] font-semibold transition-all ${
                  ratings[category] === rating ? "bg-red-600 text-white border-red-600" : "bg-white text-black hover:bg-red-50"
                }`}
              >
                {rating}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Remarks */}
      <div className="bg-[#f6f7fb] border border-black/50 px-8 py-6 mb-8">
        <h3 className="text-[22px] font-semibold text-black mb-4">REMARKS</h3>
        <input
          type="text"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Enter your remarks here"
          className="w-full max-w-[874px] px-6 py-4 border-2 border-black/50 rounded-[10px] bg-white text-[18px] text-black placeholder:text-black/40 focus:outline-none focus:border-red-400"
        />
      </div>

      {/* Submit */}
      <div className="flex justify-center mb-12">
        <button
          onClick={handleSubmit}
          className="bg-red-600 text-white px-16 py-4 rounded-[10px] text-[24px] font-extrabold border border-black hover:bg-red-700 transition-colors"
          style={{ fontFamily: "'Roboto', sans-serif" }}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
