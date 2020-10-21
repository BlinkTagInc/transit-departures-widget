/* global $, _, Pbf, FeedMessage, alert, fetch, accessibleAutocomplete,  */
/* eslint no-var: "off", no-unused-vars: "off", no-alert: "off" */

function setupTransitArrivalsWidget(routes, stops, gtfsRtTripupdatesUrl, refreshIntervalSeconds) {
  let arrivalsResponse;
  let arrivalsTimeout;

  async function fetchTripUpdates() {
    const url = `${gtfsRtTripupdatesUrl}?cacheBust=was ${new Date().getTime()}`;
    const response = await fetch(url);
    if (response.ok) {
      const bufferResponse = await response.arrayBuffer();
      const pbf = new Pbf(new Uint8Array(bufferResponse));
      const object = FeedMessage.read(pbf);

      return object.entity;
    }

    throw new Error(response.status);
  }

  function resetResults() {
    if (arrivalsTimeout) {
      clearTimeout(arrivalsTimeout);
    }

    $('#arrival_results').hide();
  }

  function formatMinutes(seconds) {
    if (seconds < 60) {
      return '&#60;1';
    }

    return Math.floor(seconds / 60);
  }

  function showLoading() {
    $('#loading').show();
  }

  function hideLoading() {
    $('#loading').hide();
  }

  function timeStamp() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    const suffix = (hours < 12) ? 'AM' : 'PM';
    hours = hours < 12 ? hours : hours - 12;
    hours = hours || 12;

    if (minutes < 10) {
      minutes = '0' + minutes;
    }

    return `${hours}:${minutes} ${suffix}`;
  }

  function renderStopInfo(stop) {
    $('#arrival_results .arrival-results-stop').text(stop ? stop.stop_name : 'Unknown Stop');

    if (stop && stop.stop_code) {
      $('#arrival_results .arrival-results-stop-code').text(`Stop ID ${stop.stop_code}`).show();
    } else {
      $('#arrival_results .arrival-results-stop-code').text('').hide();
    }

    $('#arrival_results .arrival-results-fetchtime').text(`As of ${timeStamp()}`);
  }

  function formatArrivalGroup(arrivalGroup) {
    const div = $('<div>').addClass('arrival-result');
    const { route, direction } = arrivalGroup[0];

    const routeNameDiv = $('<div>').addClass('arrival-result-route-name').appendTo(div);
    const arrivalTimesDiv = $('<div>').addClass('arrival-result-times').appendTo(div);

    if (route.route_short_name) {
      const routeColor = `#${route.route_color}` || '#ccc';
      const routeTextColor = `#${route.route_text_color}` || '#000';
      $('<div>')
        .text(route.route_short_name)
        .addClass('arrival-result-route-circle')
        .css({
          'background-color': routeColor,
          color: routeTextColor
        })
        .appendTo(routeNameDiv);
    }

    $('<div>').text(`To ${direction.direction}`).addClass('arrival-result-route-direction').appendTo(routeNameDiv);

    const sortedArrivals = _.take(_.sortBy(arrivalGroup, 'stoptime.departure.time'), 3);

    for (const arrival of sortedArrivals) {
      $('<div>')
        .addClass('arrival-result-time-container')
        .append(
          $('<div>')
            .addClass('arrival-result-time')
            .html(formatMinutes(arrival.stoptime.departure.time - (Date.now() / 1000)) + '<span class="arrival-result-time-label">min</span>')
        )
        .appendTo(arrivalTimesDiv);
    }

    return div;
  }

  function renderResults(stop, arrivals) {
    renderStopInfo(stop);

    if (arrivals.length === 0) {
      $('#arrival_results .arrival-results-container').html($('<div>').addClass('arrival-results-none').text('No upcoming arrivals'));
    } else {
      const arrivalGroups = _.groupBy(arrivals, arrival => `${arrival.route.route_id}||${arrival.direction.direction_id}`);
      const sortedArrivalGroups = _.sortBy(arrivalGroups, arrivalGroup => {
        const { route } = arrivalGroup[0];
        return Number.parseInt(route.route_short_name, 10);
      });

      $('#arrival_results .arrival-results-container').html(sortedArrivalGroups.map(arrivalGroup => formatArrivalGroup(arrivalGroup)));
    }

    hideLoading();
    $('#arrival_results').show();
  }

  function renderError(stop) {
    renderStopInfo(stop);
    $('#arrival_results .arrival-results-container').html($('<div>').addClass('arrival-results-error').text('Unable to fetch arrivals.'));

    hideLoading();
    $('#arrival_results').show();
  }

  function getRouteAndDirectionFromTrip(tripId) {
    let tripDirection;
    let tripRoute;

    for (const route of routes) {
      for (const direction of route.directions) {
        if (direction.trip_ids.includes(tripId)) {
          tripDirection = direction;
          tripRoute = route;
          break;
        }
      }

      if (tripDirection && tripRoute) {
        break;
      }
    }

    return {
      direction: tripDirection,
      route: tripRoute
    };
  }

  function selectStop({ stopId, stopCode, directionId, routeId }) {
    const stop = stops.find(stop => stop.stop_id === stopId || stop.stop_code === stopCode);
    const route = routes.find(route => route.route_id === routeId);
    const direction = route ? route.directions.find(direction => direction.direction_id.toString() === directionId) : undefined;

    if (!stop) {
      return alert('Invalid stop ID');
    }

    resetResults();

    showLoading();
    updateArrivals({ stop, direction, route });

    // Every refresh interval seconds, check for tripupdates
    arrivalsTimeout = setInterval(() => updateArrivals({ stop, direction, route }), refreshIntervalSeconds * 1000);
  }

  async function updateArrivals({ stop, direction, route }) {
    try {
      // Use existing data if less than the refresh interval seconds old
      if (!arrivalsResponse || arrivalsResponse.timestamp < Date.now() - (refreshIntervalSeconds * 1000)) {
        arrivalsResponse = {
          arrivals: await fetchTripUpdates(),
          timestamp: Date.now()
        };
      }

      const filteredArrivals = [];

      if (route) {
        // Lookup arrivals by route and direction
        arrivalsResponse.arrivals.forEach(arrival => {
          if (!arrival || !arrival.trip_update || !arrival.trip_update.trip) {
            return;
          }

          if (!direction || !direction.trip_ids.includes(arrival.trip_update.trip.trip_id)) {
            return;
          }

          const stoptime = arrival.trip_update.stop_time_update.find(stopTimeUpdate => stopTimeUpdate.stop_id === stop.stop_id);

          if (!stoptime) {
            return;
          }

          filteredArrivals.push({
            route,
            direction,
            stoptime
          });
        });
      } else if (stop) {
        // Lookup all arrivals by stop
        arrivalsResponse.arrivals.forEach(arrival => {
          if (!arrival || !arrival.trip_update || !arrival.trip_update.stop_time_update) {
            return;
          }

          const stoptime = arrival.trip_update.stop_time_update.find(stopTimeUpdate => stopTimeUpdate.stop_id === stop.stop_id);

          if (!stoptime) {
            return;
          }

          const { route, direction } = getRouteAndDirectionFromTrip(arrival.trip_update.trip.trip_id);

          filteredArrivals.push({
            route,
            direction,
            stoptime
          });
        });
      }

      renderResults(stop, filteredArrivals);
    } catch (error) {
      console.error(error);
      renderError(stop);
    }
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

      $('#real_time_arrivals #arrival_stop').append(direction.stopIds.map(stopId => {
        const stop = stops.find(stop => stop.stop_id === stopId);
        return $('<option>').val(stop.stop_id).text(stop.stop_name);
      }));
    }
  });

  $('#real_time_arrivals #arrival_stop').change(event => {
    const routeId = $('#real_time_arrivals #arrival_route').val();
    const directionId = $('#real_time_arrivals #arrival_direction').val();
    const stopId = $(event.target).val();

    selectStop({
      stopId,
      routeId,
      directionId
    });
  });

  $('#stop_id_form').submit(event => {
    event.preventDefault();

    const stopCode = $('#arrival_stop_code').val();

    if (stopCode === '') {
      return alert('Please enter a stop ID');
    }

    selectStop({
      stopCode
    });
  });

  accessibleAutocomplete({
    element: $('#arrival_stop_code_container').get(0),
    id: 'arrival_stop_code',
    source: (query, populateResults) => {
      const filteredResults = stops.filter(stop => {
        if (stop.stop_code.startsWith(query.trim())) {
          return true;
        }

        return stop.stop_name.toLowerCase().includes(query.toLowerCase());
      });
      populateResults(filteredResults);
    },
    minLength: 2,
    autoselect: true,
    placeholder: 'Enter a stop ID',
    showNoOptionsFound: false,
    templates: {
      inputValue: result => result && result.stop_code,
      suggestion: result => {
        if (!result) {
          return
        }

        const stopCode = result.is_parent_station ? 'all' : result.stop_code;

        return `<strong>${result.stop_name}</strong> (${stopCode})`;
      }
    },
    onConfirm: selectedStop => {
      if (!selectedStop) {
        return;
      }

      $('#arrival_stop_code').val(selectedStop.stop_code);
      $('#stop_id_form').trigger('submit');
    }
  });
}
