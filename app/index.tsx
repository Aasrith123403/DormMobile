import { Redirect } from 'expo-router';

/** Entry point: the root layout redirects to sign-in when there is no session. */
export default function Index() {
  return <Redirect href="/(app)/groups" />;
}
