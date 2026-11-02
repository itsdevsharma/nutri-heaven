import EngagementList from '../components/EngagementList.jsx';
import { PageHeader } from '../components/PageHeader.jsx';

export default function ReviewsPage() {
  return <>
    <PageHeader title="Customer reviews" description="Customer ratings and reviews stay private until you approve them. Rejecting an approved review removes it from the website and its rating average." />
    <EngagementList kind="reviews" />
  </>;
}
