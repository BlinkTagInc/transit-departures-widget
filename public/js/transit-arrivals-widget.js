/* global $, _, Pbf, FeedMessage, alert, fetch */
/* eslint no-var: "off", no-unused-vars: "off", no-alert: "off" */

function setupTransitArrivalsWidget(routes, gtfsRtTripupdatesUrl) {
  const stops = generateStopList(routes);
  let arrivalsTimeout;

  function generateStopList(routes) {
    const stops = {};
    for (const route of routes) {
      for (const direction of route.directions) {
        for (const stop of direction.stops) {
          stops[stop.stop_id] = stop;
        }
      }
    }

    return stops;
  }

  function resetResults() {
    if (arrivalsTimeout) {
      clearTimeout(arrivalsTimeout);
    }

    $('#arrival_results').hide();
  }

  function formatSeconds(seconds) {
    if (seconds < 60) {
      return Math.floor(seconds) + ' <span class="arrival-result-time-label">sec</span>';
    }

    return Math.floor(seconds / 60) + ' <span class="arrival-result-time-label">min</span>';
  }

  function renderResults(stopId, arrivals) {
    const stop = stops[stopId];

    $('#arrival_results .arrival-results-stop').text(`Stop: ${stop ? stop.stop_name : 'Unknown Stop'}`);

    if (arrivals.length === 0) {
      $('#arrival_results .arrival-results-container').html($('<div>').text('No upcoming arrivals'));
    } else {
      const groupedArrivals = _.groupBy(arrivals, 'route.route_id');

      $('#arrival_results .arrival-results-container').html(Object.values(groupedArrivals).map(arrivalGroup => {
        const div = $('<div>').addClass('arrival-result');
        const { route } = arrivalGroup[0];

        if (route.route_short_name) {
          const routeColor = route.route_color || '#ccc';
          const routeTextColor = route.route_text_color || '#000';
          $('<div>')
            .text(route.route_short_name)
            .addClass('route-icon')
            .css('background-color', routeColor)
            .css('color', routeTextColor)
            .appendTo(div);
        }

        if (route.route_long_name) {
          $('<div>')
            .text(route.route_long_name)
            .addClass('route-name')
            .appendTo(div);
        }

        for (const arrival of arrivalGroup) {
          $('<div>')
            .html(formatSeconds(arrival.stoptime.departure.time - (Date.now() / 1000)))
            .addClass('.arrival-result-time')
            .appendTo(div);
        }

        return div;
      }));
    }

    $('#arrival_results').show();
  }

  function formatRouteName(route) {
    let routeName = '';
    const hasShortName = Boolean(route.route_short_name);
    const hasLongName = Boolean(route.route_long_name);
    if (hasShortName) {
      routeName += route.route_short_name;
    }

    if (hasShortName && hasLongName) {
      routeName += ' - ';
    }

    if (hasLongName) {
      routeName += route.route_long_name;
    }

    return routeName;
  }

  async function fetchTripUpdates() {
    const url = `${gtfsRtTripupdatesUrl}?cacheBust=was ${new Date().getTime()}`;
    const response = await fetch(url);
    if (response.ok) {
      const bufferResponse = await response.arrayBuffer();
      const pbf = new Pbf(new Uint8Array(bufferResponse));
      const object = FeedMessage.read(pbf);

      return object.entity;
    }

    console.error(response.status);
  }

  async function updateArrivals(stopId, directionId, routeId) {
    const arrivals = await fetchTripUpdates();
    const filteredArrivals = [];
    if (routeId) {
      arrivals.forEach(arrival => {
        if (!arrival || !arrival.trip_update || !arrival.trip_update.trip) {
          return;
        }

        const route = routes.find(route => route.route_id === routeId);

        if (!route) {
          return;
        }

        const direction = route.directions.find(direction => direction.direction_id.toString() === directionId);

        if (!direction || !direction.trip_ids.includes(arrival.trip_update.trip.trip_id)) {
          return;
        }

        const stoptime = arrival.trip_update.stop_time_update.find(stop => stop.stop_id === stopId);

        if (!stoptime) {
          return;
        }

        filteredArrivals.push({
          route,
          stoptime
        });
      });
    } else if (stopId) {
      arrivals.forEach(arrival => {
        if (!arrival || !arrival.trip_update || !arrival.trip_update.stop_time_update) {
          return;
        }

        const stoptime = arrival.trip_update.stop_time_update.find(stop => stop.stop_id === stopId);

        if (!stoptime) {
          return;
        }

        filteredArrivals.push({
          route,
          stoptime
        });
      });
    }

    renderResults(stopId, filteredArrivals);
  }

  $('#real_time_arrivals input[name="arrival_type"]').change(event => {
    const value = $(event.target).val();

    $('#real_time_arrivals #route_form').toggleClass('d-none', value !== 'route');
    $('#real_time_arrivals #stop_id_form').toggleClass('d-none', value !== 'stop_id');

    $('#real_time_arrivals #arrival_stop')
      .val('')
      .prop('disabled', true);

    $('#real_time_arrivals #arrival_direction option:gt(0)').remove();
    $('#real_time_arrivals #arrival_stop option:gt(0)').remove();
    resetResults();
  });

  $('#real_time_arrivals #arrival_route').change(event => {
    const routeId = $(event.target).val();

    $('#real_time_arrivals #arrival_stop')
      .val('')
      .prop('disabled', true);

    $('#real_time_arrivals #arrival_direction option:gt(0)').remove();
    $('#real_time_arrivals #arrival_stop option:gt(0)').remove();
    resetResults();

    if (routeId === '') {
      $('#real_time_arrivals #arrival_direction')
        .val('')
        .prop('disabled', true);
    } else {
      $('#real_time_arrivals #arrival_direction')
        .val('')
        .prop('disabled', false);

      const route = routes.find(route => route.route_id === routeId);

      if (!route) {
        return console.warn(`Unable to find route ${routeId}`);
      }

      $('#real_time_arrivals #arrival_direction').append(route.directions.map(direction => {
        return $('<option>').val(direction.direction_id).text(direction.direction);
      }));
    }
  });

  $('#real_time_arrivals #arrival_direction').change(event => {
    const routeId = $('#real_time_arrivals #arrival_route').val();
    const directionId = $(event.target).val();

    $('#real_time_arrivals #arrival_stop option:gt(0)').remove();
    resetResults();

    if (directionId === '') {
      $('#real_time_arrivals #arrival_stop')
        .val('')
        .prop('disabled', true);
    } else {
      $('#real_time_arrivals #arrival_stop')
        .val('')
        .prop('disabled', false);

      const route = routes.find(route => route.route_id === routeId);

      if (!route) {
        return console.warn(`Unable to find route ${routeId}`);
      }

      const direction = route.directions.find(direction => direction.direction_id.toString() === directionId);

      $('#real_time_arrivals #arrival_stop').append(direction.stops.map(stop => {
        return $('<option>').val(stop.stop_id).text(stop.stop_name);
      }));
    }
  });

  $('#real_time_arrivals #arrival_stop').change(event => {
    const routeId = $('#real_time_arrivals #arrival_route').val();
    const directionId = $('#real_time_arrivals #arrival_direction').val();
    const stopId = $(event.target).val();
    resetResults();

    updateArrivals(stopId, directionId, routeId);

    // Every 10 seconds, check for tripupdates
    arrivalsTimeout = setTimeout(() => updateArrivals(stopId, directionId, routeId), 10000);
  });

  $('#stop_id_form').submit(event => {
    event.preventDefault();

    const stopId = $('#arrival_stop_id').val();

    if (stopId === '') {
      return alert('Please enter a stop ID');
    }

    updateArrivals(stopId);
  });
}