const stop = (id, name, lat, lng, category, time, notes, arrivalMode = "walking", travelNotes = "") =>
  ({ id, name, lat, lng, category, time, notes, arrivalMode, travelNotes, address: "" });

export const sample = {
  revision: 0,
  trips: [{
    id: "kyoto-sample",
    name: "Kyoto, slowly",
    destination: "Kyoto, Japan",
    cover: "kyoto",
    days: [{
      id: "higashiyama", date: "2027-04-08", title: "Higashiyama & Gion",
      stops: [
        stop("kiyomizu", "Kiyomizu-dera", 34.99485, 135.78505, "sight", "09:00", "Start at the hillside temple overlooking the city."),
        stop("ninenzaka", "Ninenzaka", 34.99767, 135.78094, "sight", "10:30", "Follow the stone lanes through Higashiyama."),
        stop("yasaka", "Yasaka Shrine", 35.00365, 135.77853, "sight", "11:45", "Wander through the shrine grounds toward Gion."),
        stop("nishiki", "Nishiki Market", 35.00502, 135.76489, "food", "13:00", "Lunch and snacks in the covered market.")
      ]
    }, {
      id: "arashiyama", date: "2027-04-09", title: "A day in Arashiyama",
      stops: [
        stop("bamboo", "Arashiyama Bamboo Grove", 35.01722, 135.67132, "sight", "08:30", "Go early for a quieter walk.", "transit", "Check morning trains to Saga-Arashiyama or Arashiyama Station."),
        stop("tenryuji", "Tenryū-ji", 35.01583, 135.67370, "sight", "10:00", "Make time for the garden."),
        stop("togetsukyo", "Togetsukyō Bridge", 35.01233, 135.67778, "sight", "12:00", "Cross the Katsura River and follow the riverside path.")
      ]
    }, {
      id: "fushimi", date: "2027-04-10", title: "Fushimi & central Kyoto",
      stops: [
        stop("inari", "Fushimi Inari Taisha", 34.96714, 135.77268, "sight", "08:30", "Walk part of the torii gate trail.", "transit"),
        stop("toji", "Tō-ji Temple", 34.98115, 135.74787, "sight", "11:00", "Visit the temple grounds and five-story pagoda.", "transit"),
        stop("station", "Kyoto Station", 34.98585, 135.75877, "transport", "14:00", "Pick up snacks for the onward journey.")
      ]
    }]
  }]
};
