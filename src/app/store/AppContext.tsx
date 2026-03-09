import React, { createContext, useContext, useEffect, useReducer } from "react";

export type FoodStatus = "Active" | "Inactive";

export interface FoodItem {
  id: string;
  name: string;
  variant: string;
  category: string;
  // keep it simple: store as number of minutes (placeholder allowed)
  durationMinutes: number;
  created: string;
  status: FoodStatus;
}

export interface ModelOutput {
  timestamp_ms: number;
  has_face: boolean;
  valence: number; // [-1..1]
  arousal: number; // [0..1]
  hedonicScore: number; // [1..9]
  hedonicLabel: string;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  foodId: string;
  model: ModelOutput;
  surveyRatings: Record<string, number | null>;
  remarks: string;
}

interface AppState {
  isAuthed: boolean;
  adminEmail: string;
  foods: FoodItem[];
  sessions: SessionRecord[];
  selectedFoodId: string;
  lastModelOutput: ModelOutput | null;
}

type Action =
  | { type: "LOGIN"; payload: { email: string } }
  | { type: "LOGOUT" }
  | { type: "ADD_FOOD"; payload: FoodItem }
  | { type: "TOGGLE_FOOD_STATUS"; payload: { id: string } }
  | { type: "DELETE_FOOD"; payload: { id: string } }
  | { type: "SET_SELECTED_FOOD"; payload: { id: string } }
  | { type: "SET_MODEL_OUTPUT"; payload: ModelOutput }
  | { type: "ADD_SESSION"; payload: SessionRecord };

const initialState: AppState = {
  isAuthed: false,
  adminEmail: "",
  foods: [
    {
      id: "1",
      name: "Ice Cream",
      variant: "Strawberry",
      category: "Dessert",
      durationMinutes: 15, // placeholder
      created: "02/25/2026",
      status: "Active",
    },
  ],
  sessions: [],
  selectedFoodId: "1",
  lastModelOutput: null,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOGIN":
      return { ...state, isAuthed: true, adminEmail: action.payload.email };
    case "LOGOUT":
      return { ...state, isAuthed: false, adminEmail: "" };
    case "ADD_FOOD":
      return { ...state, foods: [action.payload, ...state.foods] };
    case "TOGGLE_FOOD_STATUS":
      return {
        ...state,
        foods: state.foods.map((f) =>
          f.id === action.payload.id
            ? { ...f, status: f.status === "Active" ? "Inactive" : "Active" }
            : f
        ),
      };
    case "DELETE_FOOD":
      return { ...state, foods: state.foods.filter((f) => f.id !== action.payload.id) };
    case "SET_SELECTED_FOOD":
      return { ...state, selectedFoodId: action.payload.id };
    case "SET_MODEL_OUTPUT":
      return { ...state, lastModelOutput: action.payload };
    case "ADD_SESSION":
      return { ...state, sessions: [action.payload, ...state.sessions] };
    default:
      return state;
  }
}

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => {
    try {
      const raw = localStorage.getItem("familis_state_v1");
      if (!raw) return init;
      const parsed = JSON.parse(raw);
      return { ...init, ...parsed } as AppState;
    } catch {
      return init;
    }
  });

  useEffect(() => {
    // Persist only the important parts
    const toSave = {
      isAuthed: state.isAuthed,
      adminEmail: state.adminEmail,
      foods: state.foods,
      sessions: state.sessions,
      selectedFoodId: state.selectedFoodId,
    };
    localStorage.setItem("familis_state_v1", JSON.stringify(toSave));
  }, [state.isAuthed, state.adminEmail, state.foods, state.sessions, state.selectedFoodId]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
