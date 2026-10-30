import { useLocalSearchParams } from 'expo-router';

import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { CrossingStory } from '@/src/features/stories/crossing/CrossingStory';
import { MeridianStory } from '@/src/features/stories/meridian/MeridianStory';
import { STORY_IDS, isStoryId } from '@/src/stories/save';

export function generateStaticParams() {
  return STORY_IDS.map((storyId) => ({ storyId }));
}

/** One story, full screen. Every step is saved as it happens, so Back (or closing the app) never loses a place. */
export default function StoryScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  if (!isStoryId(storyId)) return <MessageScreen title="Story not found" body="This link doesn’t match any story." />;
  return storyId === 'crossing' ? <CrossingStory /> : <MeridianStory />;
}
