import { useLocalSearchParams } from 'expo-router';

import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { LESSON_IDS, getLesson } from '@/src/content/lessons';
import { LESSON_COMPONENTS } from '@/src/features/lessons';
import { useProgress } from '@/src/store/progress';

// Static web export renders every page the app can show; content (loaded at run time) decides what each page holds.
export function generateStaticParams() {
  return LESSON_IDS.map((lessonId) => ({ lessonId }));
}

export default function LessonScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const hydrated = useProgress((s) => s.hydrated);
  const lesson = getLesson(lessonId);

  if (!lesson) {
    return <MessageScreen title="Lesson not found" body="This link doesn't match any lesson. Pick one from the home screen." />;
  }
  // Wait for saved progress before mounting, so a resumed lesson never overwrites its own save.
  if (!hydrated) return <MessageScreen loading />;

  const Lesson = LESSON_COMPONENTS[lesson.id];
  // Keyed by id so moving to the next lesson remounts with fresh state.
  return <Lesson key={lesson.id} lesson={lesson} />;
}
