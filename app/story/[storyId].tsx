import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';

import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { CrossingStory } from '@/src/features/stories/crossing/CrossingStory';
import { MeridianStory } from '@/src/features/stories/meridian/MeridianStory';
import { useStories } from '@/src/features/stories/store';
import { track } from '@/src/observability';
import { STORY_IDS, type StoryId, isStoryId } from '@/src/stories/save';

export function generateStaticParams() {
  return STORY_IDS.map((storyId) => ({ storyId }));
}

/** One story, full screen. Every step is saved as it happens, so Back (or closing the app) never loses a place. */
export default function StoryScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  if (!isStoryId(storyId)) return <MessageScreen title="Story not found" body="This link doesn’t match any story." />;
  return (
    <>
      <StoryOpened id={storyId} />
      {storyId === 'crossing' ? <CrossingStory /> : <MeridianStory />}
    </>
  );
}

/** story_started, once per opening, after the save is loaded (so `resumed` is known). */
function StoryOpened({ id }: { id: StoryId }) {
  const loaded = useStories((s) => s.loaded);
  const sent = useRef(false);
  useEffect(() => {
    if (!loaded || sent.current) return;
    sent.current = true;
    const s = useStories.getState();
    track('story_started', { story_id: id, resumed: s[id] !== null });
  }, [id, loaded]);
  return null;
}
