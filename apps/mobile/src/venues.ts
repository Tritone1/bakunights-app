export type Venue = {
  id: number;
  name: string;
  category: "Restaurant" | "Bar" | "Pub" | "Lounge";
  rating: number;
  address: string;
  deal: string;
  hours: string;
  distance: string;
  latitude: number;
  longitude: number;
  image: string;
};

export const BAKU_CENTER = {
  latitude: 40.3977,
  longitude: 49.8671,
  latitudeDelta: 0.09,
  longitudeDelta: 0.09,
};

export const VENUES: Venue[] = [];
