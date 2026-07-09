export interface CuratedQuestion {
  id: string;
  category: "silly" | "deep" | "relationship" | "future";
  text: string;
}

export const curatedQuestions: CuratedQuestion[] = [
  {
    id: "q_1",
    category: "silly",
    text: "If we were characters in a romantic comedy, who would we be and why?"
  },
  {
    id: "q_2",
    category: "relationship",
    text: "What was the exact moment or detail that first made you smile when thinking about me?"
  },
  {
    id: "q_3",
    category: "deep",
    text: "What is a core value or belief you hold that you will never compromise on?"
  },
  {
    id: "q_4",
    category: "future",
    text: "What does your absolute dream house look like, and what's one room you must have?"
  },
  {
    id: "q_5",
    category: "silly",
    text: "What is your ultimate guilty pleasure song that you secretly sing in the shower?"
  },
  {
    id: "q_6",
    category: "relationship",
    text: "What is one little quirk or habit of mine that you find unexpectedly charming?"
  },
  {
    id: "q_7",
    category: "deep",
    text: "What is a memory from your childhood that shaped who you are today?"
  },
  {
    id: "q_8",
    category: "future",
    text: "If we could travel anywhere in the world next month, money no object, where would we go?"
  },
  {
    id: "q_9",
    category: "silly",
    text: "If you could only eat one food for the rest of your life, what would it be?"
  },
  {
    id: "q_10",
    category: "relationship",
    text: "What is your favorite photo or memory of us together so far?"
  },
  {
    id: "q_11",
    category: "deep",
    text: "What is something you are currently struggling with or trying to improve about yourself?"
  },
  {
    id: "q_12",
    category: "future",
    text: "What is a major life goal you want to achieve in the next three years?"
  },
  {
    id: "q_13",
    category: "silly",
    text: "What was your most embarrassing childhood nickname and how did you get it?"
  },
  {
    id: "q_14",
    category: "relationship",
    text: "If you had to describe our connection in just three words, which words would you choose?"
  },
  {
    id: "q_15",
    category: "deep",
    text: "How do fill your emotional cup when you are feeling drained or stressed?"
  },
  {
    id: "q_16",
    category: "future",
    text: "What is a new hobby or skill you want us to learn or try together?"
  },
  {
    id: "q_17",
    category: "silly",
    text: "If you were a superhero, what would your useless secondary superpower be?"
  },
  {
    id: "q_18",
    category: "relationship",
    text: "Which of our dates or conversations has been your favorite so far?"
  },
  {
    id: "q_19",
    category: "deep",
    text: "What does a perfect, deeply peaceful day look like to you?"
  },
  {
    id: "q_20",
    category: "future",
    text: "Where do you see yourself in five years, both personally and professionally?"
  },
  {
    id: "q_21",
    category: "silly",
    text: "What is the weirdest dream you can remember having recently?"
  },
  {
    id: "q_22",
    category: "relationship",
    text: "What's a song or a lyric that reminds you of me?"
  },
  {
    id: "q_23",
    category: "deep",
    text: "What is the best piece of advice you have ever received, and who gave it to you?"
  },
  {
    id: "q_24",
    category: "future",
    text: "What is something you are most excited about for our future?"
  },
  {
    id: "q_25",
    category: "silly",
    text: "If you could swap lives with any animal for 24 hours, which one would you choose?"
  },
  {
    id: "q_26",
    category: "relationship",
    text: "What is one thing you hope we never change about the way we communicate?"
  },
  {
    id: "q_27",
    category: "deep",
    text: "What is something that instantly makes you feel loved and appreciated?"
  },
  {
    id: "q_28",
    category: "future",
    text: "What are three items on your ultimate life bucket list?"
  },
  {
    id: "q_29",
    category: "silly",
    text: "If you could have dinner with any historical figure, who would it be?"
  },
  {
    id: "q_30",
    category: "relationship",
    text: "What was your very first impression of me when we first met or started talking?"
  }
];

// Helper to get a curated question by index
export function getQuestionByIndex(index: number): CuratedQuestion {
  const safeIndex = Math.abs(index) % curatedQuestions.length;
  return curatedQuestions[safeIndex];
}

// Get the Question of the Day based on a calendar date (for consistent sync across devices!)
export function getQuestionOfToday(): CuratedQuestion {
  const today = new Date();
  // Generate a stable number based on year, month, date
  const dateHash = today.getFullYear() * 1000 + (today.getMonth() + 1) * 50 + today.getDate();
  return getQuestionByIndex(dateHash);
}
